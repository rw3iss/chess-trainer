// Pure openings search engine — runs inside the search Web Worker (and in-process
// as a fallback / in tests). MiniSearch handles fuzzy text over name, aliases and
// family; ECO codes and SAN move sequences ("e4 c5 Nf3", "1.d4 d5 2.c4") are
// recognised token-by-token and matched exactly (ECO prefix / SAN line prefix).
// Filters + sort run over the whole set; results are indices into `entries`.
import MiniSearch from 'minisearch';
import type { Color } from '@chess/core/chess';
import type { OpeningEntry } from '@chess/core/openings';

export const OPENING_SORTS = ['relevance', 'popularity', 'name', 'eco', 'length', 'white', 'black', 'recent'] as const;
export type OpeningSort = (typeof OPENING_SORTS)[number];
export const ECO_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export interface OpeningQuery {
	q: string;
	color?: Color;
	/** ECO letters (A–E); empty/undefined = all. */
	eco?: string[];
	family?: string;
	minPlies?: number;
	maxPlies?: number;
	notes?: boolean;
	fav?: boolean;
	/** Default: 'relevance' with a query, else 'popularity'. */
	sort?: OpeningSort;
}

/** Per-query user context (favorites, recently viewed — newest first). */
export interface QueryContext {
	favoriteIds?: readonly string[];
	recentIds?: readonly string[];
}

export interface ParsedSearch {
	/** Free-text words for MiniSearch. */
	text: string;
	/** Normalised SAN sequence (line prefix). */
	san: string[];
	/** ECO prefixes, upper-case ('B9', 'C42'). */
	eco: string[];
}

const SAN_RE = /^(?:[kqrbn]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[qrbn])?|o-o(?:-o)?)$/;
const ECO_RE = /^[a-e]\d\d$/i;
const ECO_SHORT_RE = /^[A-E]\d?$/;

/** Normalise one SAN token for matching: lower-case, no check/annotation glyphs, 0-0 → o-o, no '='. */
export function normalizeSan(san: string): string {
	return san
		.toLowerCase()
		.replace(/[+#!?]/g, '')
		.replace(/0/g, 'o')
		.replace(/=/g, '');
}

/** Split a raw query into free text, SAN line and ECO tokens. */
export function parseSearch(raw: string): ParsedSearch {
	const text: string[] = [];
	const san: string[] = [];
	const eco: string[] = [];
	for (const rawTok of raw.trim().split(/[\s,]+/)) {
		const tok = rawTok.replace(/^\d+\.+/, '');
		if (!tok) continue;
		if (ECO_RE.test(tok) || ECO_SHORT_RE.test(tok)) {
			eco.push(tok.toUpperCase());
			continue;
		}
		const s = normalizeSan(tok);
		if (SAN_RE.test(s)) san.push(s);
		else text.push(tok);
	}
	return { text: text.join(' '), san, eco };
}

export function defaultSort(q: OpeningQuery): OpeningSort {
	return q.q.trim() ? 'relevance' : 'popularity';
}

interface Doc {
	id: number;
	name: string;
	aliases: string;
	family: string;
}

export interface SearchEngine {
	readonly entries: readonly OpeningEntry[];
	query(q: OpeningQuery, ctx?: QueryContext): Int32Array;
}

const pop = (e: OpeningEntry): number => e.popularity?.score ?? -1;
/** Lower-case, letters/digits/spaces only ("King's" → "kings"). */
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();

/** Build the engine (MiniSearch index + precomputed sort keys). ~12k entries → well under a second. */
export function createSearchEngine(entries: readonly OpeningEntry[]): SearchEngine {
	const mini = new MiniSearch<Doc>({
		fields: ['name', 'aliases', 'family'],
		idField: 'id',
		searchOptions: { prefix: true, fuzzy: 0.2, combineWith: 'AND', boost: { name: 3, family: 2, aliases: 1 } },
	});
	mini.addAll(entries.map((e, i) => ({ id: i, name: e.name, aliases: (e.aliases ?? []).join(' · '), family: e.family })));

	const sanNorm = entries.map((e) => e.san.map(normalizeSan));
	const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
	const byName = entries.map((_, i) => i).sort((a, b) => collator.compare(entries[a]!.name, entries[b]!.name));
	const nameRank = new Int32Array(entries.length);
	byName.forEach((idx, rank) => (nameRank[idx] = rank));

	// Default tie-break: popular first, then shorter (more fundamental) lines, then name.
	const base = (a: number, b: number): number => {
		const ea = entries[a]!;
		const eb = entries[b]!;
		return pop(eb) - pop(ea) || ea.plies - eb.plies || nameRank[a]! - nameRank[b]!;
	};

	function matchesSan(i: number, seq: string[]): boolean {
		const line = sanNorm[i]!;
		if (line.length < seq.length) return false;
		for (let k = 0; k < seq.length; k++) if (line[k] !== seq[k]) return false;
		return true;
	}

	function query(q: OpeningQuery, ctx: QueryContext = {}): Int32Array {
		const parsed = parseSearch(q.q);
		const sort = q.sort ?? defaultSort(q);
		const relevance = new Map<number, number>();
		let candidates: number[] | null = null;

		if (parsed.text) {
			const hits = mini.search(parsed.text);
			candidates = hits.map((h) => h.id as number);
			for (const h of hits) relevance.set(h.id as number, h.score);
		}

		const favs = q.fav ? new Set(ctx.favoriteIds ?? []) : null;
		const ecoLetters = q.eco?.length ? new Set(q.eco.map((l) => l.toUpperCase())) : null;
		const out: number[] = [];
		const consider = (i: number) => {
			const e = entries[i]!;
			if (q.color && e.perspective !== q.color) return;
			if (ecoLetters && !ecoLetters.has(e.eco[0]!)) return;
			if (q.family && e.family !== q.family) return;
			if (q.minPlies !== undefined && e.plies < q.minPlies) return;
			if (q.maxPlies !== undefined && e.plies > q.maxPlies) return;
			if (q.notes && !e.hasNotes) return;
			if (favs && !favs.has(e.id)) return;
			if (parsed.eco.length && !parsed.eco.some((p) => e.eco.startsWith(p))) return;
			if (parsed.san.length && !matchesSan(i, parsed.san)) return;
			out.push(i);
		};
		if (candidates) for (const i of candidates) consider(i);
		else for (let i = 0; i < entries.length; i++) consider(i);

		const cmp = comparator(sort, parsed, relevance, ctx);
		out.sort(cmp);
		return Int32Array.from(out);
	}

	function comparator(sort: OpeningSort, parsed: ParsedSearch, relevance: Map<number, number>, ctx: QueryContext): (a: number, b: number) => number {
		const e = (i: number) => entries[i]!;
		switch (sort) {
			case 'name':
				return (a, b) => nameRank[a]! - nameRank[b]!;
			case 'eco':
				return (a, b) => (e(a).eco < e(b).eco ? -1 : e(a).eco > e(b).eco ? 1 : nameRank[a]! - nameRank[b]!);
			case 'length':
				return (a, b) => e(a).plies - e(b).plies || base(a, b);
			case 'white':
			case 'black': {
				const key = (i: number) => {
					const p = e(i).popularity;
					return p ? p[sort] : -1;
				};
				return (a, b) => key(b) - key(a) || base(a, b);
			}
			case 'recent': {
				const rank = new Map<string, number>();
				(ctx.recentIds ?? []).forEach((id, k) => rank.set(id, k));
				const key = (i: number) => rank.get(e(i).id) ?? Number.MAX_SAFE_INTEGER;
				return (a, b) => key(a) - key(b) || base(a, b);
			}
			case 'relevance': {
				if (relevance.size) {
					// MiniSearch score, nudged towards canonical (Lichess), popular and shorter lines.
					// A name/family containing the whole phrase ('kings indian' ⊂ "King's Indian Defense") wins.
					const phrase = squash(parsed.text);
					const scores = new Map<number, number>();
					for (const [i, r] of relevance) {
						const x = e(i);
						const exact = squash(x.family).startsWith(phrase) ? 1.6 : squash(x.name).includes(phrase) ? 1.3 : 1;
						scores.set(i, r * exact * (1 + Math.max(0, pop(x)) / 200) * (x.source === 'lichess' ? 1.25 : 1) * (1 + 2 / (x.plies + 4)));
					}
					const score = (i: number) => scores.get(i) ?? 0;
					return (a, b) => score(b) - score(a) || e(a).plies - e(b).plies || base(a, b);
				}
				if (parsed.san.length) {
					// Exact line first, then by popularity / length.
					const n = parsed.san.length;
					return (a, b) => Number(e(b).plies === n) - Number(e(a).plies === n) || base(a, b);
				}
				return base;
			}
			case 'popularity':
			default:
				return base;
		}
	}

	return { entries, query };
}

import { Chess, normalizeMove } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { INITIAL_FEN, type Uci } from '../chess/types.js';
import { epdOf } from './id.js';
import type { Continuation, GraphFile, LineMatch, NextOpening, OpeningEntry, OpeningsFile } from './types.js';

/** Order for openings that share a final position: Lichess first, then shorter lines, then name. */
function compareSamePosition(a: OpeningEntry, b: OpeningEntry): number {
	const sa = a.source === 'lichess' ? 0 : 1;
	const sb = b.source === 'lichess' ? 0 : 1;
	return sa - sb || a.plies - b.plies || a.name.localeCompare(b.name);
}

function score(e: OpeningEntry | undefined): number {
	return e?.popularity?.score ?? -1;
}

/**
 * In-memory opening lookup over the shipped `openings` + `graph` datasets.
 * Positions are matched by EPD, so transpositions resolve to the same node.
 */
export class OpeningIndex {
	private readonly entries: OpeningEntry[];
	private readonly ids = new Map<string, OpeningEntry>();
	private readonly nodeByEpd = new Map<string, number>();
	/** node → openings ending there (sorted, best first). */
	private readonly endsAt = new Map<number, OpeningEntry[]>();
	/** node → openings whose line passes through or ends at it. */
	private readonly through = new Map<number, OpeningEntry[]>();
	/** node → nextOpenings result. */
	private readonly nextCache = new Map<number, NextOpening[]>();
	/** Opening family tree by move-line prefix (built on first use). */
	private family?: { parent: Map<string, OpeningEntry>; children: Map<string, OpeningEntry[]>; total: Map<string, number> };

	private constructor(
		openings: OpeningsFile,
		private readonly graph: GraphFile,
	) {
		this.entries = openings.openings;
		for (const e of this.entries) this.ids.set(e.id, e);
		graph.epd.forEach((epd, i) => this.nodeByEpd.set(epd, i));
		for (const [node, list] of Object.entries(graph.ends)) {
			const found = list.map((id) => this.ids.get(id)).filter((e): e is OpeningEntry => !!e);
			if (found.length) this.endsAt.set(Number(node), found.sort(compareSamePosition));
		}
		for (const e of this.entries) {
			let node = 0;
			const seen = new Set<number>();
			for (const uci of e.uci) {
				const edge = graph.edges[node]?.find((ed) => ed[0] === uci);
				if (!edge) break;
				node = edge[2];
				if (seen.has(node)) continue;
				seen.add(node);
				let arr = this.through.get(node);
				if (!arr) this.through.set(node, (arr = []));
				arr.push(e);
			}
		}
	}

	/**
	 * Openings this one is built on: named openings whose move line is a strict prefix of it,
	 * shortest first (e.g. Sicilian Defense → Sicilian Defense: Open → this).
	 */
	lineage(id: string): OpeningEntry[] {
		const { parent } = this.familyTree();
		const out: OpeningEntry[] = [];
		for (let p = parent.get(id); p; p = parent.get(p.id)) out.unshift(p);
		return out;
	}

	/** Named openings that extend this one directly (nearest named extension), most popular first. */
	variations(id: string): OpeningEntry[] {
		return this.familyTree().children.get(id) ?? [];
	}

	/** Number of named openings that extend this one (all depths). */
	variationCount(id: string): number {
		return this.familyTree().total.get(id) ?? 0;
	}

	/** Openings that extend no other named opening (first level of the family tree). */
	rootOpenings(): OpeningEntry[] {
		return this.familyTree().children.get('') ?? [];
	}

	private familyTree(): NonNullable<OpeningIndex['family']> {
		if (this.family) return this.family;
		// One canonical opening per move line (others with the same line hang under it as aliases).
		const byLine = new Map<string, OpeningEntry>();
		for (const e of [...this.entries].sort(compareSamePosition)) {
			const key = e.uci.join(' ');
			if (!byLine.has(key)) byLine.set(key, e);
		}
		const parent = new Map<string, OpeningEntry>();
		const children = new Map<string, OpeningEntry[]>();
		for (const e of this.entries) {
			const key = e.uci.join(' ');
			let p: OpeningEntry | undefined = byLine.get(key) !== e ? byLine.get(key) : undefined;
			for (let k = e.uci.length - 1; !p && k > 0; k--) p = byLine.get(e.uci.slice(0, k).join(' '));
			if (p) parent.set(e.id, p);
			const pid = p?.id ?? '';
			let arr = children.get(pid);
			if (!arr) children.set(pid, (arr = []));
			arr.push(e);
		}
		for (const arr of children.values()) arr.sort((a, b) => score(b) - score(a) || a.plies - b.plies || a.name.localeCompare(b.name));
		const total = new Map<string, number>();
		const count = (id: string): number => {
			const known = total.get(id);
			if (known !== undefined) return known;
			let n = 0;
			for (const c of children.get(id) ?? []) n += 1 + count(c.id);
			total.set(id, n);
			return n;
		};
		for (const e of this.entries) count(e.id);
		this.family = { parent, children, total };
		return this.family;
	}

	static fromData(openings: OpeningsFile, graph: GraphFile): OpeningIndex {
		return new OpeningIndex(openings, graph);
	}

	byId(id: string): OpeningEntry | undefined {
		return this.ids.get(id);
	}

	all(): OpeningEntry[] {
		return this.entries;
	}

	private node(fenOrEpd: string): number | undefined {
		return this.nodeByEpd.get(epdOf(fenOrEpd));
	}

	/** Opening whose line ends exactly at this position (best match if several). */
	identify(fenOrEpd: string): OpeningEntry | undefined {
		const n = this.node(fenOrEpd);
		return n === undefined ? undefined : this.endsAt.get(n)?.[0];
	}

	/**
	 * Deepest named opening reached along a move sequence. Replays the moves, so
	 * transpositions and lines that leave and re-enter the book are recognised.
	 * Accepts standard (e1g1) or king-takes-rook (e1h1) castling UCI. Stops at the first illegal move.
	 */
	identifyLine(uci: Uci[], startFen: string = INITIAL_FEN): OpeningEntry | undefined {
		return this.matchLine(uci, startFen).opening;
	}

	/**
	 * Where a move sequence stands against the book: the deepest named opening along it
	 * (`opening`, reached at `openingPly`), how many legal moves were replayed (`plies`), and
	 * whether the final position is still a book position (`inBook`). `plies > openingPly`
	 * means moves were played after the last named opening.
	 */
	matchLine(uci: Uci[], startFen: string = INITIAL_FEN): LineMatch {
		const out: LineMatch = { openingPly: 0, plies: 0, inBook: false, fen: startFen };
		const setup = parseFen(startFen);
		if (setup.isErr) return out;
		const chess = Chess.fromSetup(setup.value);
		if (chess.isErr) return out;
		const pos = chess.value;
		const first = this.identify(startFen);
		if (first) out.opening = first;
		out.inBook = this.node(startFen) !== undefined;
		for (const u of uci) {
			const parsed = parseUci(u);
			if (!parsed) break;
			const move = normalizeMove(pos, parsed);
			if (!pos.isLegal(move)) break;
			pos.play(move);
			out.plies++;
			const fen = makeFen(pos.toSetup());
			out.fen = fen;
			const n = this.node(fen);
			out.inBook = n !== undefined;
			const hit = n === undefined ? undefined : this.endsAt.get(n)?.[0];
			if (hit) {
				out.opening = hit;
				out.openingPly = out.plies;
			}
		}
		return out;
	}

	/**
	 * Named openings that continue from this position (the nearest named opening down each
	 * line), most popular first. `fromPly` is the ply in the opening's own line where it
	 * reaches this position, so `entry.uci.slice(fromPly)` are the moves still to play.
	 * Matches by position, so lines reached by a transposition are found too.
	 */
	nextOpenings(fenOrEpd: string): NextOpening[] {
		const n = this.node(fenOrEpd);
		if (n === undefined) return [];
		const cached = this.nextCache.get(n);
		if (cached) return cached;
		const cands = n === 0 ? this.entries : (this.through.get(n) ?? []);
		// One canonical opening per remaining line.
		const byRest = new Map<string, NextOpening>();
		for (const e of [...cands].sort(compareSamePosition)) {
			const k = this.plyOf(e, n);
			if (k < 0 || k >= e.uci.length) continue;
			const rest = e.uci.slice(k).join(' ');
			if (!byRest.has(rest)) byRest.set(rest, { entry: e, fromPly: k });
		}
		const out: NextOpening[] = [];
		for (const [rest, item] of byRest) {
			const moves = rest.split(' ');
			let nearest = true;
			for (let j = 1; j < moves.length && nearest; j++) if (byRest.has(moves.slice(0, j).join(' '))) nearest = false;
			if (nearest) out.push(item);
		}
		out.sort((a, b) => score(b.entry) - score(a.entry) || a.entry.plies - b.entry.plies || a.entry.name.localeCompare(b.entry.name));
		this.nextCache.set(n, out);
		return out;
	}

	/** Ply at which opening `e`'s line first reaches graph node `n` (-1 if it never does). */
	private plyOf(e: OpeningEntry, n: number): number {
		if (n === 0) return 0;
		let node = 0;
		for (let i = 0; i < e.uci.length; i++) {
			const edge = this.graph.edges[node]?.find((ed) => ed[0] === e.uci[i]);
			if (!edge) return -1;
			node = edge[2];
			if (node === n) return i + 1;
		}
		return -1;
	}

	/** Book moves from this position, most popular first. */
	continuations(fen: string): Continuation[] {
		const n = this.node(fen);
		if (n === undefined) return [];
		const out: Continuation[] = (this.graph.edges[n] ?? []).map(([uci, san, to]) => {
			const thru = this.through.get(to) ?? [];
			const named = this.endsAt.get(to)?.[0];
			const pop = named?.popularity?.score ?? thru.reduce((m, e) => Math.max(m, score(e)), -1);
			const c: Continuation = { uci, san, openingIds: thru.map((e) => e.id) };
			if (named) c.name = named.name;
			if (pop >= 0) c.popularity = pop;
			return c;
		});
		return out.sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1) || b.openingIds.length - a.openingIds.length);
	}

	/** Openings whose line passes through or ends at this position, shortest first. */
	openingsThrough(fenOrEpd: string): OpeningEntry[] {
		const n = this.node(fenOrEpd);
		if (n === undefined) return [];
		const list = n === 0 ? this.entries : (this.through.get(n) ?? []);
		return [...list].sort((a, b) => a.plies - b.plies || score(b) - score(a) || a.name.localeCompare(b.name));
	}

	/**
	 * ECO letter of the notes chunk that holds the note for this position (if any):
	 * the letter of the smallest ECO code among openings through / ending at it.
	 */
	notesChunk(fenOrEpd: string): string | undefined {
		const n = this.node(fenOrEpd);
		if (n === undefined) return undefined;
		return notesChunkOf(this.through.get(n) ?? []);
	}
}

/** Shared rule (also used by the data pipeline): min ECO letter among the given openings. */
export function notesChunkOf(openings: Pick<OpeningEntry, 'eco'>[]): string | undefined {
	let min: string | undefined;
	for (const o of openings) if (min === undefined || o.eco < min) min = o.eco;
	return min?.[0];
}

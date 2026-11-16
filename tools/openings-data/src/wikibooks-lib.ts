// Wikibooks "Chess Opening Theory" page tree → named opening lines.
// Each page title is a move path ('Chess Opening Theory/1. e4/1...c5/2. Nf3'); its Position
// template (or first level-1 heading) carries the opening name shown on the page.
import { resolve } from 'node:path';
import { readJsonl } from './jsonl.js';
import { WIKI_LINES_CACHE } from './paths.js';
import { hasMoveText, nameKey } from './names.js';
import type { RawLine } from './sources.js';

export const WIKI_PAGES_FILE = resolve(WIKI_LINES_CACHE, 'pages.jsonl');
export const WIKI_PREFIX = 'Chess Opening Theory/';

/** Cached page: title + the start of its wikitext (parsed at build time, so parser fixes need no refetch). */
export interface WikiPageRow {
	title: string;
	head?: string;
	/** Older cache rows: the name parsed at fetch time. */
	name?: string;
	t: number;
}

/** Characters of wikitext kept per page (the Position template and first heading are at the top). */
export const WIKI_HEAD_CHARS = 800;

/** SAN moves of a page title, or null when the title is not a move path. */
export function titleToSans(title: string): string[] | null {
	if (!title.startsWith(WIKI_PREFIX)) return null;
	const parts = title.slice(WIKI_PREFIX.length).split('/');
	const out: string[] = [];
	for (const [i, part] of parts.entries()) {
		const m = /^(\d+)\.(\.\.)?\s*(\S+)$/.exec(part.trim());
		if (!m) return null;
		const white = !m[2];
		if (white !== (i % 2 === 0) || Number(m[1]) !== Math.floor(i / 2) + 1) return null;
		out.push(m[3]!);
	}
	return out.length ? out : null;
}

/** Opening name shown on a page: the Position template's name field, else the first `=Heading=`. */
export function pageName(wikitext: string): string | undefined {
	const named = /\{\{\s*Chess Opening Theory\/Position[^}]*?\|\s*name\s*=\s*([^|{}\n]+?)\s*[|\n]/i.exec(wikitext);
	const tpl = /\{\{\s*Chess Opening Theory\/Position\s*\|\s*=?\s*\|?\s*([^|{}\n=]+?)\s*\|/i.exec(wikitext);
	const heading = /^=\s*([^=\n]+?)\s*=\s*$/m.exec(wikitext);
	for (const cand of [named?.[1], tpl?.[1], heading?.[1]]) {
		const raw = (cand ?? '')
			.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
			.replace(/'''?/g, '')
			.replace(/^name\s*=\s*/i, '')
			.replace(/\s*:\s*/g, ': ')
			.trim();
		if (!raw || raw.length > 120 || !/[A-Za-z]{3}/.test(raw) || /^(position|chess opening theory)$/i.test(raw) || /[{}<>=|]/.test(raw)) continue;
		return raw;
	}
	return undefined;
}

/**
 * Named lines from the cached pages: a page counts only when its name differs from its parent
 * page's name (Wikibooks repeats the opening name on every deeper page).
 */
export function wikibooksLines(rows: WikiPageRow[] = readJsonl<WikiPageRow>(WIKI_PAGES_FILE)): RawLine[] {
	const byTitle = new Map(rows.map((r) => [r.title, r]));
	const out: RawLine[] = [];
	const nameOf = (r: WikiPageRow | undefined) => (r ? (r.head !== undefined ? pageName(r.head) : r.name) : undefined);
	for (const r of byTitle.values()) {
		const name = nameOf(r);
		// Names made of moves ("Caro-Kann - 4. c3 Nc6") or long descriptions are not opening names.
		if (!name || hasMoveText(name) || name.length > 60) continue;
		const sans = titleToSans(r.title);
		if (!sans) continue;
		const parentName = nameOf(byTitle.get(r.title.slice(0, r.title.lastIndexOf('/'))));
		if (parentName && nameKey(parentName) === nameKey(name)) continue;
		out.push({ eco: '', name, sans, source: 'wikibooks', aliases: [] });
	}
	return out;
}

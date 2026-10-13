import { resolve } from 'node:path';
import type { MergedOpening } from './merge.js';
import { NOTES_CACHE } from './paths.js';
import { readJsonl } from './jsonl.js';

export const WIKIBOOKS_API = 'https://en.wikibooks.org/w/api.php';
export const WIKIBOOKS_PREFIX = 'Chess Opening Theory';
export const NOTES_SOURCE = 'Wikibooks — Chess Opening Theory (CC BY-SA 4.0)';
export const NOTE_MAX_CHARS = 1500;
export const INFO_CACHE = resolve(NOTES_CACHE, 'info.jsonl');
export const EXTRACT_CACHE = resolve(NOTES_CACHE, 'extracts.jsonl');

/** Existence check result for a requested title. `resolved` = canonical page title after normalisation/redirects. */
export interface InfoRow {
	title: string;
	exists: boolean;
	resolved?: string;
	length?: number;
}
export interface ExtractRow {
	title: string;
	extract: string;
}

/** Wikibooks page title for a SAN path: 'Chess Opening Theory/1. e4/1...e5/2. Nf3'. Check/mate marks are dropped. */
export function wikibooksTitle(sans: string[]): string {
	const parts = sans.map((s, i) => {
		const san = s.replace(/[+#]/g, '');
		const n = Math.floor(i / 2) + 1;
		return i % 2 === 0 ? `${n}. ${san}` : `${n}...${san}`;
	});
	return [WIKIBOOKS_PREFIX, ...parts].join('/');
}

export function wikibooksUrl(title: string): string {
	return 'https://en.wikibooks.org/wiki/' + encodeURI(title.replace(/ /g, '_')).replace(/\?/g, '%3F');
}

export interface Prefix {
	sans: string[];
	title: string;
	epd: string;
}

/** Every distinct SAN prefix (ply ≥ 1) of every opening line, with the EPD reached. */
export function collectPrefixes(openings: MergedOpening[]): Map<string, Prefix> {
	const out = new Map<string, Prefix>();
	for (const { entry, epds } of openings) {
		for (let p = 1; p <= entry.san.length; p++) {
			const sans = entry.san.slice(0, p);
			const title = wikibooksTitle(sans);
			if (!out.has(title)) out.set(title, { sans, title, epd: epds[p]! });
		}
	}
	return out;
}

const DROP_SECTIONS = /^(references|see also|theory table|external links|further reading|sources|notes|statistics|bibliography|footnotes)$/i;
const BOILERPLATE = [
	/this page is a stub/i,
	/you can help wikibooks/i,
	/help (us )?by expanding/i,
	/please follow the conventions/i,
	/when contributing to this wikibook/i,
	/^chess opening theory$/i,
	/^this (page|article|section) (needs|is incomplete|has no)/i,
	/^the theory table/i,
	/^\.$/,
	/^— /,
];

/** Wikibooks plain-text extract → short note: drops trailing reference sections, stub boilerplate, the title heading; caps length. */
export function cleanExtract(raw: string, max = NOTE_MAX_CHARS): string {
	const lines = raw.replace(/\r/g, '').split('\n');
	const out: string[] = [];
	let first = true;
	for (const l of lines) {
		const line = l.trim();
		const h = /^(=+)\s*(.*?)\s*\1$/.exec(line);
		if (h) {
			const title = h[2]!;
			if (DROP_SECTIONS.test(title)) break;
			// Headings before any body text are page titles / move echoes ('= English Opening =', '== 6...d5! ==').
			if (first) continue;
			out.push('', `**${title}**`);
			continue;
		}
		if (BOILERPLATE.some((re) => re.test(line))) continue;
		if (line) first = false;
		out.push(line);
	}
	let text = out
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		// Drop headings left without a body.
		.replace(/\*\*[^*\n]+\*\*\n*(?=\n\*\*|$)/g, '')
		.trim();
	if (text.length > max) {
		const cut = text.slice(0, max);
		const para = cut.lastIndexOf('\n\n');
		const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
		const at = para > max * 0.6 ? para : sentence > max * 0.6 ? sentence + 1 : cut.lastIndexOf(' ');
		text = cut.slice(0, at > 0 ? at : max).trim() + ' …';
	}
	// Notes that are nothing but a heading or a sentence fragment are not worth shipping.
	return text.replace(/\*\*/g, '').trim().length < 60 ? '' : text;
}

export interface NotesCache {
	info: Map<string, InfoRow>;
	extracts: Map<string, string>;
}

export function loadNotesCache(): NotesCache {
	const info = new Map(readJsonl<InfoRow>(INFO_CACHE).map((r) => [r.title, r]));
	const extracts = new Map(readJsonl<ExtractRow>(EXTRACT_CACHE).map((r) => [r.title, r.extract]));
	return { info, extracts };
}

/** Assemble notes keyed by EPD from the cache (first path with a usable page wins per EPD; shorter paths first). */
export function buildNotes(prefixes: Map<string, Prefix>, cache: NotesCache): Map<string, { text: string; source: string; url: string }> {
	const notes = new Map<string, { text: string; source: string; url: string }>();
	const sorted = [...prefixes.values()].sort((a, b) => a.sans.length - b.sans.length);
	for (const p of sorted) {
		if (notes.has(p.epd)) continue;
		const info = cache.info.get(p.title);
		if (!info?.exists || !info.resolved) continue;
		const raw = cache.extracts.get(info.resolved);
		if (!raw) continue;
		const text = cleanExtract(raw);
		if (!text) continue;
		notes.set(p.epd, { text, source: NOTES_SOURCE, url: wikibooksUrl(info.resolved) });
	}
	return notes;
}

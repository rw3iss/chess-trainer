import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC_CACHE } from './paths.js';
import { sanTokens } from './replay.js';
import { wikibooksLines } from './wikibooks-lib.js';

/** Name/line sources, best first: names from an earlier source win. */
export const SOURCE_ORDER = ['lichess', 'eco.json', 'scid', 'wikibooks'] as const;
export type SourceTag = (typeof SOURCE_ORDER)[number];

export interface RawLine {
	eco: string;
	name: string;
	/** SAN tokens of the main line. */
	sans: string[];
	source: SourceTag;
	/** Extra names (eco.json alias values). */
	aliases: string[];
	/** eco.json FEN key (for sanity checks). */
	fen?: string;
}

/** Parse a Lichess chess-openings TSV (header: eco, name, pgn). */
export function parseLichessTsv(text: string): RawLine[] {
	const lines = text.split(/\r?\n/).filter((l) => l.trim());
	const header = lines.shift()?.split('\t') ?? [];
	const ci = { eco: header.indexOf('eco'), name: header.indexOf('name'), pgn: header.indexOf('pgn') };
	if (ci.eco < 0 || ci.name < 0 || ci.pgn < 0) throw new Error('Unexpected TSV header: ' + header.join(','));
	return lines.map((l) => {
		const cols = l.split('\t');
		return {
			eco: cols[ci.eco]!.trim(),
			name: cols[ci.name]!.trim(),
			sans: sanTokens(cols[ci.pgn]!),
			source: 'lichess' as const,
			aliases: [],
		};
	});
}

interface EcoJsonEntry {
	src?: string;
	eco?: string;
	moves?: string;
	name?: string;
	aliases?: Record<string, string>;
}

/** Parse an eco.json ecoX.json file (FEN-keyed). Skips `interpolated` gap-fillers. */
export function parseEcoJson(text: string): RawLine[] {
	const data = JSON.parse(text) as Record<string, EcoJsonEntry>;
	const out: RawLine[] = [];
	for (const [fen, e] of Object.entries(data)) {
		if (!e || e.src === 'interpolated' || !e.moves || !e.name || !e.eco) continue;
		out.push({
			eco: e.eco.trim(),
			name: e.name.trim(),
			sans: sanTokens(e.moves),
			source: 'eco.json',
			aliases: Object.values(e.aliases ?? {})
				.map((a) => a.trim())
				.filter(Boolean),
			fen,
		});
	}
	return out;
}

/**
 * Parse SCID's scid.eco: `B90a "Sicilian: Najdorf"  1.e4 c5 … *` (an entry may wrap over lines,
 * ends at `*`; `#` starts a comment line). Extended codes (B90a, B90a1) keep the 3-character ECO.
 */
export function parseScidEco(text: string): RawLine[] {
	const body = text
		.split(/\r?\n/)
		.filter((l) => !l.trimStart().startsWith('#'))
		.join(' ');
	const out: RawLine[] = [];
	for (const m of body.matchAll(/([A-E]\d\d)[a-z]?\d?\s+"([^"]+)"\s*([^*]*)\*/g)) {
		const sans = sanTokens(m[3]!);
		if (!sans.length) continue;
		out.push({ eco: m[1]!, name: m[2]!.trim(), sans, source: 'scid', aliases: [] });
	}
	return out;
}

export const SCID_FILE = 'scid.eco';
export const SCID_URL = 'https://raw.githubusercontent.com/benini/scid/master/scid.eco';

export const LICHESS_FILES = ['a', 'b', 'c', 'd', 'e'].map((l) => `${l}.tsv`);
export const ECO_JSON_FILES = ['A', 'B', 'C', 'D', 'E'].map((l) => `eco${l}.json`);
export const LICHESS_URL = (f: string) => `https://raw.githubusercontent.com/lichess-org/chess-openings/master/${f}`;
export const ECO_JSON_URL = (f: string) => `https://raw.githubusercontent.com/JeffML/eco.json/master/${f}`;

export interface Sources {
	lichess: RawLine[];
	eco: RawLine[];
	scid: RawLine[];
	wikibooks: RawLine[];
}

/** Read cached source files (see download.ts) and the crawled Wikibooks lines (empty until `wikibooks` ran). */
export function loadSources(dir = SRC_CACHE): Sources {
	const read = (f: string) => {
		const p = resolve(dir, f);
		if (!existsSync(p)) throw new Error(`Missing source ${p} — run the build (it downloads sources) or delete .cache/src to refetch.`);
		return readFileSync(p, 'utf8');
	};
	return {
		lichess: LICHESS_FILES.flatMap((f) => parseLichessTsv(read(f))),
		eco: ECO_JSON_FILES.flatMap((f) => parseEcoJson(read(f))),
		scid: parseScidEco(read(SCID_FILE)),
		wikibooks: wikibooksLines(),
	};
}

import type { Color, Uci } from '../chess/types.js';

export interface OpeningPopularity {
	/** Lichess games (blitz/rapid/classical, 1600–2500) reaching the final position. */
	games: number;
	/** Percentages 0..100 of those games. */
	white: number;
	draws: number;
	black: number;
	mastersGames?: number;
	/** Log-scaled percentile 0..100. */
	score: number;
}

export interface OpeningEntry {
	/** Stable id: short hash of the UCI line. Survives dataset updates. */
	id: string;
	name: string;
	/** Name before ':' (e.g. 'Sicilian Defense'). */
	family: string;
	/** Name after ':' if any. */
	variation?: string;
	eco: string;
	uci: Uci[];
	san: string[];
	plies: number;
	/** Side the line is "for" (whose last defining move it is). */
	perspective: Color;
	aliases?: string[];
	/** EPD (first 4 FEN fields) of the final position. */
	epd: string;
	popularity?: OpeningPopularity;
	hasNotes?: boolean;
	/** Data source tag: 'lichess' | 'eco.json' | … */
	source: string;
}

export interface OpeningNote {
	/** Plain text / light markdown. */
	text: string;
	/** Attribution label, e.g. 'Wikibooks — Chess Opening Theory (CC BY-SA 4.0)'. */
	source: string;
	url: string;
}

/** Manifest at /data/manifest.json. File paths are relative to /data/. */
export interface OpeningsManifest {
	version: number;
	generatedAt: string;
	counts: { openings: number; positions: number; notes: number; withPopularity: number };
	files: {
		openings: string;
		graph: string;
		/** Notes chunks keyed by ECO letter A–E. */
		notes: Record<string, string>;
	};
	attribution: string[];
}

export interface OpeningsFile {
	version: number;
	openings: OpeningEntry[];
}

/**
 * Position graph. Nodes are indexed integers; `epd[i]` is node i's EPD.
 * `edges[i]` = [uci, san, toIndex][]. `ends[i]` = opening ids whose line ends at node i.
 * Node 0 is the initial position.
 */
export interface GraphFile {
	version: number;
	epd: string[];
	edges: Array<Array<[Uci, string, number]>>;
	ends: Record<number, string[]>;
}

export interface NotesFile {
	version: number;
	/** Keyed by EPD. */
	notes: Record<string, OpeningNote>;
}

export interface Continuation {
	uci: Uci;
	san: string;
	/** Openings whose line passes through / ends at the resulting position. */
	openingIds: string[];
	/** Deepest named opening at the resulting position, if any. */
	name?: string;
	popularity?: number;
}

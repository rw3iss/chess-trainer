import type { Color, Uci } from '../chess/types.js';

/**
 * Game statistics from ONE provider database for the final position of an opening.
 * Counts from different providers are never added up or compared with each other.
 */
export interface ProviderStats {
	/** Games reaching the final position. */
	games: number;
	/** Percentages 0..100 of those games. */
	white: number;
	draws: number;
	black: number;
	/** Popularity 0..100 within this provider (log-scaled percentile). */
	score: number;
}

/** Stats providers. 'lichess' = Lichess online games (blitz/rapid/classical, 1600–2500); 'masters' = Lichess masters (OTB, 2200+). */
export const STATS_SOURCES = ['lichess', 'masters'] as const;
export type StatsSource = (typeof STATS_SOURCES)[number];

/** Top-level fields are the Lichess stats (the default provider); `masters` is the masters database. */
export interface OpeningPopularity extends ProviderStats {
	masters?: ProviderStats;
}

export interface OpeningEntry {
	/** Stable id: short hash of the UCI line. Survives dataset updates. */
	id: string;
	/** URL slug from the name, unique ("-2", "-3" for repeated names; see assignSlugs). Older data: computed by OpeningIndex. */
	slug?: string;
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
	/** Data source of the name and line: 'lichess' | 'eco.json' | 'scid' | 'wikibooks'. */
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

/** Result of `OpeningIndex.matchLine`: where a move sequence stands against the book. */
export interface LineMatch {
	/** Deepest named opening along the line. */
	opening?: OpeningEntry;
	/** Ply where `opening` is reached (0 = start position). */
	openingPly: number;
	/** Legal moves replayed (stops at the first illegal move). */
	plies: number;
	/** The final position is a book position. */
	inBook: boolean;
	/** FEN of the final position. */
	fen: string;
}

/** Result row of `OpeningIndex.nextOpenings`. */
export interface NextOpening {
	entry: OpeningEntry;
	/** Ply in `entry`'s own line where it reaches the queried position. */
	fromPly: number;
}

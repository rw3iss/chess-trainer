import type { Uci } from '../chess/types.js';
import type { ThinkSetting } from '../game/types.js';

export type EngineFamily = 'stockfish' | 'maia' | 'fairy' | 'lc0' | 'komodo';
export type EngineKind = 'local' | 'remote';

/** Static description of an engine, used by the registry and the settings cards. */
export interface EngineMeta {
	id: string;
	name: string;
	family: EngineFamily;
	kind: EngineKind;
	description: string;
	/** Download size for local engines (MB). */
	sizeMb?: number;
	/** Elo range the engine can be tuned to (strategy may go below via blunder blend). */
	eloRange: [number, number];
	humanLike: boolean;
	license: string;
	pros: string[];
	cons: string[];
	/** Local engine that must be downloaded explicitly before use. */
	requiresDownload?: boolean;
	/** Needs SharedArrayBuffer (COOP/COEP headers). */
	requiresIsolation?: boolean;
}

export interface EngineCapabilities {
	limitStrength: boolean;
	multiPv: boolean;
	analysis: boolean;
	ponder: boolean;
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'busy' | 'error' | 'unavailable';

/** Start FEN + UCI moves played from it. */
export interface EnginePosition {
	fen: string;
	moves: Uci[];
}

export interface PlayOptions {
	targetElo?: number;
	think: ThinkSetting;
}

export interface AnalyzeOptions {
	multiPv: number;
	depth?: number;
	movetimeMs?: number;
	/** Run until stop() is called. */
	infinite?: boolean;
}

/** Score from the side-to-move's point of view (raw UCI). Use `toWhitePov` for display. */
export interface EngineScore {
	cp?: number;
	mate?: number;
	/** Present when the engine reports bounds. */
	bound?: 'lower' | 'upper';
}

export interface EngineInfo {
	depth: number;
	seldepth?: number;
	multipv: number;
	score: EngineScore;
	pv: Uci[];
	nodes?: number;
	nps?: number;
	timeMs?: number;
	/** Policy probability for policy-only engines (Maia), 0..1. */
	policy?: number;
}

export interface PlayResult {
	uci: Uci;
	info?: EngineInfo;
}

export interface EngineAdapter {
	readonly meta: EngineMeta;
	readonly capabilities: EngineCapabilities;
	readonly status: EngineStatus;
	/** Load / connect. `onProgress` receives 0..1 for downloads. */
	init(onProgress?: (fraction: number) => void): Promise<void>;
	newGame(): void;
	play(pos: EnginePosition, opts: PlayOptions): Promise<PlayResult>;
	/** Starts analysis; returns a function that stops it. */
	analyze(pos: EnginePosition, opts: AnalyzeOptions, onInfo: (info: EngineInfo) => void): () => void;
	stop(): void;
	dispose(): void;
}

/** Search limits for one `go` command. */
export interface GoLimits {
	movetimeMs?: number;
	depth?: number;
	nodes?: number;
	/** Search until `stop`. Overrides the other limits. */
	infinite?: boolean;
}

/** Output of the strength strategy: what to send the engine for one move. */
export interface StrengthPlan {
	/** UCI `setoption` values. Keys are exact option names (e.g. 'UCI_Elo', 'UCI Elo', 'Skill Level'). */
	options: Record<string, string | number | boolean>;
	go: GoLimits;
	/** 0..1 probability of replacing the engine move with a random legal non-mating-blunder move. */
	blunderChance: number;
	/** Minimum wall time before the bot's move is shown (so instant bots don't feel jarring). */
	minDelayMs: number;
	/** Maia: rating bucket / model to use. */
	ratingBucket?: number;
	/** Policy sampling temperature (policy engines). 0 = argmax. */
	temperature?: number;
}

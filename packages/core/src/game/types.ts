import type { Color, GameResult, MoveTree } from '../chess/types.js';
import type { ClockState } from '../clock/types.js';

export type SessionMode = 'analysis' | 'bot' | 'local-pvp' | 'online';
export type PlaybackSpeed = 'slow' | 'medium' | 'fast';

/** Default ms per move for each playback speed (user-configurable in settings). */
export const PLAYBACK_INTERVAL_MS: Record<PlaybackSpeed, number> = {
	slow: 2000,
	medium: 1000,
	fast: 400,
};

export type ThinkPreset = 'instant' | 'fast' | 'normal' | 'deep';
export type ThinkSetting = { preset: ThinkPreset } | { movetimeMs: number };

export interface SourceRef {
	kind: 'opening' | 'fork' | 'new' | 'import' | 'saved' | 'online';
	openingId?: string;
	parentSessionId?: string;
	/** Node id in the parent the fork was taken at. */
	atNodeId?: string;
	savedGameId?: string;
	roomId?: string;
}

export interface BotConfig {
	engineId: string;
	targetElo: number;
	/** Color the bot plays. */
	color: Color;
	think: ThinkSetting;
	allowTakebacks: boolean;
}

export interface PvpConfig {
	autoFlip: boolean;
	/** Tabletop: top clock / labels rotated 180° for face-to-face play. */
	tabletop: boolean;
}

/** An open game "tab". Autosaved on every change; stays open until closed. */
export interface Session {
	id: string;
	title: string;
	tree: MoveTree;
	/** Node id of the position shown on the board. */
	cursor: string;
	orientation: Color;
	mode: SessionMode;
	source: SourceRef;
	/** Saved game this session overwrites on "Save". Unset until first save. */
	savedGameId?: string;
	bot?: BotConfig;
	pvp?: PvpConfig;
	clock?: ClockState;
	playback: { speed: PlaybackSpeed; playing: boolean };
	result?: GameResult;
	/**
	 * Node where `result` happened. The result only applies while the cursor is on this node
	 * (see `activeResult`), so stepping back lets the user continue from an earlier position.
	 * Unset on older sessions: then the result applies on any leaf.
	 */
	resultNodeId?: string;
	/** True when the tree changed since the last explicit save. */
	dirty: boolean;
	createdAt: number;
	updatedAt: number;
	revision: number;
}

/** A user-saved snapshot of a game. */
export interface SavedGame {
	id: string;
	name: string;
	tags: string[];
	favorite: boolean;
	tree: MoveTree;
	finalFen: string;
	source: SourceRef;
	mode: SessionMode;
	result?: GameResult;
	notes?: string;
	createdAt: number;
	updatedAt: number;
	revision: number;
	/** Set when created via "Save as new" from a session linked to another game. */
	parentGameId?: string;
}

export interface NewSessionOptions {
	title?: string;
	fen?: string;
	tree?: MoveTree;
	cursor?: string;
	orientation?: Color;
	mode?: SessionMode;
	source?: SourceRef;
	now?: number;
	id?: string;
}

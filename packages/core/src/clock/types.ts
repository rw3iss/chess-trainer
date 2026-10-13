import type { Color } from '../chess/types.js';

export interface ClockConfig {
	initialMs: number;
	incrementMs: number;
	/** Simple (Bronstein-style) delay before the clock starts counting down each move. */
	delayMs?: number;
}

/**
 * Pure clock state. All functions take `now` (ms) so the same machine runs
 * deterministically on client and server (server is authoritative online).
 */
export interface ClockState {
	config: ClockConfig;
	/** Remaining ms as of `lastStartedAt` (or now, if not running). */
	remaining: Record<Color, number>;
	/** Side whose clock is running; null when paused / not started. */
	running: Color | null;
	lastStartedAt: number | null;
	/** Side that ran out of time, if any. */
	flagged: Color | null;
	/** Side to move when paused (so resume knows whose clock to start). */
	toMove: Color;
}

export interface ClockPreset {
	id: string;
	label: string;
	config: ClockConfig;
}

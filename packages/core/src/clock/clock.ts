/**
 * Deterministic chess clock state machine. Every transition takes `now` (ms)
 * so client and server compute identical results.
 *
 * Delay: simple (US) delay — at the start of each turn the
 * mover's clock does not count down for `delayMs`. Unused delay is not banked.
 * `delayRemaining` tracks unused delay across pause/resume within one turn.
 */
import type { Color } from '../chess/types.js';
import type { ClockConfig, ClockPreset, ClockState } from './types.js';

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');

const MIN = 60_000;
const preset = (mins: number, incSec: number): ClockPreset => ({
	id: `${mins}+${incSec}`,
	label: `${mins}+${incSec}`,
	config: { initialMs: mins * MIN, incrementMs: incSec * 1000 },
});

export const CLOCK_PRESETS: ClockPreset[] = [
	preset(1, 0),
	preset(2, 1),
	preset(3, 0),
	preset(3, 2),
	preset(5, 0),
	preset(5, 3),
	preset(10, 0),
	preset(10, 5),
	preset(15, 10),
	preset(30, 0),
	preset(30, 20),
];

export function createClock(config: ClockConfig, toMove: Color = 'white'): ClockState {
	return {
		config,
		remaining: { white: config.initialMs, black: config.initialMs },
		running: null,
		lastStartedAt: null,
		flagged: null,
		toMove,
	};
}

/** Time the running side has used since `lastStartedAt`, split into delay and real time. */
function elapsedSplit(state: ClockState, now: number): { delayUsed: number; timeUsed: number } {
	if (state.running === null || state.lastStartedAt === null) return { delayUsed: 0, timeUsed: 0 };
	const elapsed = Math.max(0, now - state.lastStartedAt);
	const delay = state.delayRemaining ?? 0;
	const delayUsed = Math.min(elapsed, delay);
	return { delayUsed, timeUsed: elapsed - delayUsed };
}

export function remainingAt(state: ClockState, color: Color, now: number): number {
	if (state.running !== color) return state.remaining[color];
	return Math.max(0, state.remaining[color] - elapsedSplit(state, now).timeUsed);
}

/** Starts the clock of `toMove` with a fresh delay. No-op if running or flagged. */
export function startClock(state: ClockState, now: number): ClockState {
	if (state.running !== null || state.flagged !== null) return state;
	return { ...state, running: state.toMove, lastStartedAt: now, delayRemaining: state.config.delayMs ?? 0 };
}

/**
 * The side to move finished its move: stop its clock, add increment, start the
 * opponent's clock (with a fresh delay). If no clock is running (not started /
 * paused), the opponent's clock is simply started — no time or increment applied.
 * If the mover had already run out of time, the clock flags instead.
 */
export function pressClock(state: ClockState, now: number): ClockState {
	if (state.flagged !== null) return state;
	const mover = state.running ?? state.toMove;
	const next = other(mover);
	const remaining = { ...state.remaining };
	if (state.running !== null) {
		const left = remainingAt(state, mover, now);
		if (left <= 0) {
			remaining[mover] = 0;
			return { ...state, remaining, running: null, lastStartedAt: null, flagged: mover, toMove: mover };
		}
		remaining[mover] = left + state.config.incrementMs;
	}
	return {
		...state,
		remaining,
		running: next,
		lastStartedAt: now,
		toMove: next,
		delayRemaining: state.config.delayMs ?? 0,
	};
}

/** Stop the running clock, keeping its unused delay. Flags if time ran out. */
export function pauseClock(state: ClockState, now: number): ClockState {
	if (state.running === null) return state;
	const mover = state.running;
	const { delayUsed, timeUsed } = elapsedSplit(state, now);
	const left = Math.max(0, state.remaining[mover] - timeUsed);
	return {
		...state,
		remaining: { ...state.remaining, [mover]: left },
		running: null,
		lastStartedAt: null,
		toMove: mover,
		flagged: left <= 0 ? mover : null,
		delayRemaining: Math.max(0, (state.delayRemaining ?? 0) - delayUsed),
	};
}

/** Restart the paused side's clock (unused delay of this turn is preserved). */
export function resumeClock(state: ClockState, now: number): ClockState {
	if (state.running !== null || state.flagged !== null) return state;
	return {
		...state,
		running: state.toMove,
		lastStartedAt: now,
		delayRemaining: state.delayRemaining ?? state.config.delayMs ?? 0,
	};
}

/** Returns a flagged state if the running side has no time left; otherwise the same state. */
export function checkFlag(state: ClockState, now: number): ClockState {
	if (state.running === null || state.flagged !== null) return state;
	const mover = state.running;
	if (remainingAt(state, mover, now) > 0) return state;
	return {
		...state,
		remaining: { ...state.remaining, [mover]: 0 },
		running: null,
		lastStartedAt: null,
		flagged: mover,
		toMove: mover,
	};
}

export function isLowTime(state: ClockState, color: Color, now: number, thresholdMs: number): boolean {
	return remainingAt(state, color, now) < thresholdMs;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** '4:59', '0:09.3' (below `tenthsUnderMs`), '1:02:03'. Truncates (never rounds up). */
export function formatClock(ms: number, opts: { tenthsUnderMs?: number } = {}): string {
	const tenthsUnderMs = opts.tenthsUnderMs ?? 10_000;
	const t = Math.max(0, Math.floor(ms));
	const totalSec = Math.floor(t / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
	if (t < tenthsUnderMs) return `${m}:${pad2(s)}.${Math.floor((t % 1000) / 100)}`;
	return `${m}:${pad2(s)}`;
}

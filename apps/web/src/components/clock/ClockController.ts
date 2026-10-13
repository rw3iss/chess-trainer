// ClockController — drives session clocks for local games (PLAN §4.3 "Clock").
//   · presses the clock (core pressClock) whenever a NEW move is added to a session
//   · ticks (interval) only while some clock is running; publishes `now` for views
//   · checkFlag → clock flagged + session.result { reason: 'timeout' }
//   · pauses on game end, on tab hidden (setting) and when a local session is
//     not the active tab; resumes what it paused
//   · low-time crossing → onLowTime (sound)
// All side effects are injected (sessions, update, timers, visibility) so tests
// drive it with fake timers. Online sessions are server-authoritative: skipped.
import { signal, type ReadonlySignal } from '@preact/signals';
import { turnFromFen, type Color } from '@chess/core/chess';
import { checkFlag, pauseClock, pressClock, remainingAt, resumeClock, type ClockState } from '@chess/core/clock';
import type { Session } from '@chess/core/game';

export const CLOCK_TICK_MS = 100;

export interface ClockControllerSettings {
	pauseOnHidden: boolean;
	lowTimeMs: number;
}

export interface ClockControllerDeps {
	now(): number;
	sessions(): Session[];
	activeId(): string | null;
	update(id: string, patch: Partial<Session>): void;
	/** Calls fn whenever sessions change; returns unsubscribe. */
	subscribe(fn: () => void): () => void;
	settings(): ClockControllerSettings;
	/** Interval scheduler (default setInterval). */
	every?(fn: () => void, ms: number): () => void;
	/** Page visibility (default document). */
	visibility?: { hidden(): boolean; subscribe(fn: () => void): () => void };
	onLowTime?(session: Session, color: Color): void;
	onFlag?(session: Session, color: Color): void;
}

interface Seen {
	nodes: number;
	result: boolean;
}

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');

/** Clocks the controller manages: local (non-online) sessions with a clock. */
export function isManaged(s: Session): s is Session & { clock: ClockState } {
	return !!s.clock && s.mode !== 'online';
}

function defaultEvery(fn: () => void, ms: number): () => void {
	const h = setInterval(fn, ms);
	return () => clearInterval(h);
}

function documentVisibility(): ClockControllerDeps['visibility'] {
	if (typeof document === 'undefined') return undefined;
	return {
		hidden: () => document.visibilityState === 'hidden',
		subscribe: (fn) => {
			document.addEventListener('visibilitychange', fn);
			return () => document.removeEventListener('visibilitychange', fn);
		},
	};
}

export class ClockController {
	private readonly _now = signal(0);
	/** Current time for clock views; advances every tick while a clock runs. */
	readonly now: ReadonlySignal<number> = this._now;
	private seen = new Map<string, Seen>();
	/** Sessions whose clock this controller paused (hidden tab / inactive tab). */
	private autoPaused = new Set<string>();
	/** Per session: colours already warned for low time. */
	private warned = new Map<string, Set<Color>>();
	private stopTick: (() => void) | null = null;
	private offs: (() => void)[] = [];
	private syncing = false;
	private resync = false;
	private started = false;

	constructor(private readonly deps: ClockControllerDeps) {}

	start(): void {
		if (this.started) return;
		this.started = true;
		this._now.value = this.deps.now();
		this.restore();
		this.offs.push(this.deps.subscribe(() => this.sync()));
		const vis = this.deps.visibility ?? documentVisibility();
		if (vis) this.offs.push(vis.subscribe(() => this.onVisibility(vis.hidden())));
		this.sync();
	}

	stop(): void {
		this.offs.forEach((off) => off());
		this.offs = [];
		this.stopTick?.();
		this.stopTick = null;
		this.started = false;
		this.seen.clear();
		this.autoPaused.clear();
		this.warned.clear();
	}

	/** Manual pause (clock tap). */
	pause(id: string): void {
		const s = this.find(id);
		if (!s?.clock || s.clock.running === null) return;
		this.autoPaused.delete(id);
		this.write(s, { clock: pauseClock(s.clock, this.deps.now()) });
	}

	/** Manual resume (clock tap). No-op when the game is over or flagged. */
	resume(id: string): void {
		const s = this.find(id);
		if (!s?.clock || s.result || s.clock.running !== null || s.clock.flagged) return;
		this.autoPaused.delete(id);
		this.write(s, { clock: resumeClock(s.clock, this.deps.now()) });
	}

	/** True when the clock has been started (a move was made) but is not running and the game is live. */
	isPaused(s: Session): boolean {
		return !!s.clock && s.clock.running === null && !s.clock.flagged && !s.result && Object.keys(s.tree.nodes).length > 1;
	}

	// ── internals ─────────────────────────────────────────────────────────
	private find(id: string): Session | undefined {
		return this.deps.sessions().find((s) => s.id === id);
	}

	private write(s: Session, patch: Partial<Session>): void {
		this.deps.update(s.id, patch);
		this.ensureTicking();
	}

	/** Clocks restored from storage were running when the page closed: park them (time as of the last press). */
	private restore(): void {
		for (const s of this.deps.sessions()) {
			if (!isManaged(s)) continue;
			const c = s.clock;
			if (c.running !== null) {
				this.deps.update(s.id, { clock: { ...c, running: null, lastStartedAt: null, toMove: c.running } });
			}
		}
	}

	private sync(): void {
		if (this.syncing) {
			this.resync = true;
			return;
		}
		this.syncing = true;
		try {
			do {
				this.resync = false;
				this.syncOnce();
			} while (this.resync);
		} finally {
			this.syncing = false;
		}
		this.ensureTicking();
	}

	private syncOnce(): void {
		const now = this.deps.now();
		const active = this.deps.activeId();
		const live = new Set<string>();
		for (const s of this.deps.sessions()) {
			live.add(s.id);
			if (!isManaged(s)) {
				this.seen.delete(s.id);
				continue;
			}
			const nodes = Object.keys(s.tree.nodes).length;
			const prev = this.seen.get(s.id);
			this.seen.set(s.id, { nodes, result: !!s.result });
			if (!prev) continue;
			let clock = s.clock;
			// Press on a new move — also when that move continued the game from an earlier position
			// (the old result was cleared), which restarts the paused clock.
			if (nodes > prev.nodes && !clock.flagged && !(prev.result && s.result)) clock = this.pressFor(s, clock, now);
			if (s.result && clock.running !== null) clock = pauseClock(clock, now);
			// Only the active local game runs; others are parked until re-activated.
			if (s.id !== active && clock.running !== null && s.mode === 'local-pvp') {
				clock = pauseClock(clock, now);
				this.autoPaused.add(s.id);
			} else if (s.id === active && this.autoPaused.has(s.id) && !this.hiddenPause() && clock.running === null && !s.result) {
				clock = resumeClock(clock, now);
				this.autoPaused.delete(s.id);
			}
			if (clock !== s.clock) this.deps.update(s.id, { clock });
		}
		for (const id of this.seen.keys()) if (!live.has(id)) this.seen.delete(id);
	}

	/** A move was played: the side that moved presses its clock. */
	private pressFor(s: Session, clock: ClockState, now: number): ClockState {
		const fen = s.tree.nodes[s.cursor]?.fen;
		if (!fen) return clock;
		const mover = other(turnFromFen(fen));
		let c = clock;
		// Re-align if the clock thinks the other side is to move (moves made while paused, branch switch).
		if ((c.running ?? c.toMove) !== mover) {
			c = pauseClock(c, now);
			if (c.flagged) return c;
			c = { ...c, toMove: mover };
		}
		return pressClock(c, now);
	}

	private hiddenPause(): boolean {
		const vis = this.deps.visibility ?? documentVisibility();
		return !!vis?.hidden() && this.deps.settings().pauseOnHidden;
	}

	private onVisibility(hidden: boolean): void {
		const now = this.deps.now();
		if (hidden) {
			if (!this.deps.settings().pauseOnHidden) return;
			for (const s of this.deps.sessions()) {
				if (!isManaged(s) || s.clock.running === null) continue;
				this.autoPaused.add(s.id);
				this.deps.update(s.id, { clock: pauseClock(s.clock, now) });
			}
		} else {
			const active = this.deps.activeId();
			for (const s of this.deps.sessions()) {
				if (!isManaged(s) || !this.autoPaused.has(s.id) || s.id !== active || s.result) continue;
				this.autoPaused.delete(s.id);
				this.deps.update(s.id, { clock: resumeClock(s.clock, now) });
			}
		}
		this.ensureTicking();
	}

	private anyRunning(): boolean {
		return this.deps.sessions().some((s) => isManaged(s) && s.clock.running !== null);
	}

	private ensureTicking(): void {
		this._now.value = this.deps.now();
		const running = this.anyRunning();
		if (running && !this.stopTick) this.stopTick = (this.deps.every ?? defaultEvery)(() => this.tick(), CLOCK_TICK_MS);
		else if (!running && this.stopTick) {
			this.stopTick();
			this.stopTick = null;
		}
	}

	/** One tick: publish time, detect flags and low-time crossings. */
	tick(): void {
		const now = this.deps.now();
		this._now.value = now;
		const { lowTimeMs } = this.deps.settings();
		for (const s of this.deps.sessions()) {
			if (!isManaged(s) || s.clock.running === null) continue;
			const mover = s.clock.running;
			const flagged = checkFlag(s.clock, now);
			if (flagged !== s.clock) {
				const patch: Partial<Session> = { clock: flagged };
				if (!s.result) patch.result = { winner: other(mover), reason: 'timeout' };
				this.deps.update(s.id, patch);
				this.deps.onFlag?.(s, mover);
				continue;
			}
			const left = remainingAt(s.clock, mover, now);
			const warned = this.warned.get(s.id) ?? new Set<Color>();
			if (lowTimeMs > 0 && left < lowTimeMs && s.clock.config.initialMs > lowTimeMs) {
				if (!warned.has(mover)) {
					warned.add(mover);
					this.warned.set(s.id, warned);
					this.deps.onLowTime?.(s, mover);
				}
			} else if (warned.has(mover)) warned.delete(mover);
		}
		this.ensureTicking();
	}
}

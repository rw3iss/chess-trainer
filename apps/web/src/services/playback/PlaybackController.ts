// PlaybackController — auto-steps a session forward from its cursor to the end
// of the current line at a configurable speed (PLAN §4.3 Playback).
// Session-agnostic: it receives its dependencies, so it is unit-testable and
// keeps running regardless of which route/panel is visible.
import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { PlaybackSpeed } from '@chess/core/game';

export interface PlaybackDeps {
	/** Is there a next move from the session's cursor along its line? */
	canAdvance(sessionId: string): boolean;
	/** Advance one ply (programmatic — must not count as a user action). */
	advance(sessionId: string): void;
	/** Jump to the start of the line (used when Play is pressed at the end). */
	rewind(sessionId: string): void;
	/** Current speed for the session. */
	speedOf(sessionId: string): PlaybackSpeed;
	/** ms per move for a speed (from settings). */
	intervalFor(speed: PlaybackSpeed): number;
}

export class PlaybackController {
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly _playing = signal<ReadonlySet<string>>(new Set());
	readonly playing: ReadonlySignal<ReadonlySet<string>> = this._playing;

	constructor(private deps: PlaybackDeps) {}

	isPlaying(sessionId: string | null | undefined): boolean {
		return !!sessionId && this._playing.value.has(sessionId);
	}

	/** Reactive `isPlaying` for a fixed id. */
	playingSignal(sessionId: string): ReadonlySignal<boolean> {
		return computed(() => this._playing.value.has(sessionId));
	}

	play(sessionId: string): void {
		if (this.isPlaying(sessionId)) return;
		if (!this.deps.canAdvance(sessionId)) {
			this.deps.rewind(sessionId);
			if (!this.deps.canAdvance(sessionId)) return;
		}
		this.setPlaying(sessionId, true);
		this.schedule(sessionId);
	}

	pause(sessionId: string): void {
		const t = this.timers.get(sessionId);
		if (t) clearTimeout(t);
		this.timers.delete(sessionId);
		if (this.isPlaying(sessionId)) this.setPlaying(sessionId, false);
	}

	toggle(sessionId: string): void {
		if (this.isPlaying(sessionId)) this.pause(sessionId);
		else this.play(sessionId);
	}

	/** Re-time the pending step after a speed change. */
	retime(sessionId: string): void {
		if (!this.isPlaying(sessionId)) return;
		const t = this.timers.get(sessionId);
		if (t) clearTimeout(t);
		this.schedule(sessionId);
	}

	stopAll(): void {
		for (const id of Array.from(this.timers.keys())) this.pause(id);
		this._playing.value = new Set();
	}

	private schedule(sessionId: string): void {
		const ms = this.deps.intervalFor(this.deps.speedOf(sessionId));
		this.timers.set(
			sessionId,
			setTimeout(() => this.tick(sessionId), ms),
		);
	}

	private tick(sessionId: string): void {
		this.timers.delete(sessionId);
		if (!this.isPlaying(sessionId)) return;
		if (!this.deps.canAdvance(sessionId)) {
			this.pause(sessionId);
			return;
		}
		this.deps.advance(sessionId);
		if (this.deps.canAdvance(sessionId)) this.schedule(sessionId);
		else this.pause(sessionId);
	}

	private setPlaying(sessionId: string, on: boolean): void {
		const next = new Set(this._playing.value);
		if (on) next.add(sessionId);
		else next.delete(sessionId);
		this._playing.value = next;
	}
}

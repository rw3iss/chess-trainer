import { positionStatus, type Color, type EngineAdapter, type EnginePosition, type PlayResult, type ThinkSetting, type Uci } from '@chess/core';
import { isAbortError } from '../types';
import { fenAfter, waitMinDelay } from '../util';

export interface BotConfig {
	/** Side the bot plays. */
	color: Color;
	targetElo?: number;
	think: ThinkSetting;
	/** Extra floor on wall time per bot move (adapters already apply the strength plan's minDelayMs). */
	minDelayMs?: number;
	/** Gate (e.g. clock paused / game over in UI terms). Default: always on. */
	enabled?: boolean;
}

export interface BotPlayerDeps {
	adapter: EngineAdapter;
	config: BotConfig;
	/** Current position (start FEN + moves), or null when there is none. */
	getPosition: () => EnginePosition | null;
	/** Plays the bot's move into the game (only called if the position is unchanged). */
	applyMove: (uci: Uci, result: PlayResult) => void;
	onThinking?: (thinking: boolean) => void;
	onError?: (err: Error) => void;
	now?: () => number;
}

const keyOf = (p: EnginePosition): string => `${p.fen}|${p.moves.join(' ')}`;

/**
 * Drives a bot side. Call `sync()` after every position change (move, undo,
 * navigation, config change): if it's the bot's turn it asks the engine for a
 * move, and an in-flight request for an older position is cancelled and its
 * result discarded.
 *
 *   const bot = new BotPlayer({ adapter, config, getPosition, applyMove });
 *   bot.sync();               // after each move
 *   bot.dispose();            // on detach
 */
export class BotPlayer {
	private config: BotConfig;
	private inflight: { key: string; gen: number } | null = null;
	private gen = 0;
	private disposed = false;

	constructor(private readonly deps: BotPlayerDeps) {
		this.config = { ...deps.config };
	}

	get thinking(): boolean {
		return this.inflight !== null;
	}

	setConfig(patch: Partial<BotConfig>): void {
		this.config = { ...this.config, ...patch };
		this.cancel();
		this.sync();
	}

	/** Re-evaluates: starts thinking if it's the bot's turn, cancels stale work otherwise. */
	sync(): void {
		if (this.disposed) return;
		const pos = this.deps.getPosition();
		const key = pos ? keyOf(pos) : '';
		if (this.inflight && this.inflight.key === key) return;
		this.cancel();
		if (!pos || this.config.enabled === false) return;
		const fen = fenAfter(pos);
		if (!fen) return;
		const status = positionStatus(fen);
		if (status.outcome || status.turn !== this.config.color) return;
		void this.think(pos, key);
	}

	/** Cancels any in-flight request (its result will be ignored). */
	cancel(): void {
		if (!this.inflight) return;
		this.inflight = null;
		this.gen++;
		this.deps.adapter.stop();
		this.deps.onThinking?.(false);
	}

	dispose(): void {
		this.cancel();
		this.disposed = true;
	}

	private async think(pos: EnginePosition, key: string): Promise<void> {
		const gen = ++this.gen;
		this.inflight = { key, gen };
		this.deps.onThinking?.(true);
		const started = (this.deps.now ?? Date.now)();
		const isCurrent = (): boolean => !this.disposed && this.inflight?.gen === gen;
		try {
			const opts = this.config.targetElo === undefined ? { think: this.config.think } : { think: this.config.think, targetElo: this.config.targetElo };
			const result = await this.deps.adapter.play(pos, opts);
			if (this.config.minDelayMs) await waitMinDelay(started, this.config.minDelayMs, this.deps.now);
			if (!isCurrent()) return;
			const now = this.deps.getPosition();
			if (!now || keyOf(now) !== key) return;
			this.inflight = null;
			this.deps.onThinking?.(false);
			this.deps.applyMove(result.uci, result);
		} catch (err) {
			if (!isCurrent()) return;
			this.inflight = null;
			this.deps.onThinking?.(false);
			if (!isAbortError(err)) this.deps.onError?.(err instanceof Error ? err : new Error(String(err)));
		}
	}
}

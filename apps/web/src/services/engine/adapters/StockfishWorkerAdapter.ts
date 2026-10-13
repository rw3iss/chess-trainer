import {
	buildGoCommand,
	buildPositionCommand,
	parseBestMove,
	parseInfoLine,
	pickBlunderMove,
	resolveStrength,
	setOptionCommands,
	type AnalyzeOptions,
	type EngineAdapter,
	type EngineCapabilities,
	type EngineInfo,
	type EngineMeta,
	type EnginePosition,
	type EngineStatus,
	type GoLimits,
	type PlayOptions,
	type PlayResult,
} from '@chess/core';
import { JobQueue, type Job, type JobKind } from '../jobQueue';
import { defaultWorkerFactory, EngineAbortError, type WorkerFactory } from '../types';
import { UciEngine } from '../uciEngine';
import { fenAfter, waitMinDelay } from '../util';

export interface StockfishWorkerOptions {
	/** URL of the stockfish `.js` worker script. */
	scriptUrl: string;
	/**
	 * Optional override for the `.wasm` location (e.g. a blob: URL from Cache
	 * Storage). Passed to stockfish.js as the worker URL hash, which it uses
	 * instead of `<script>.wasm`.
	 */
	resolveWasmUrl?: () => Promise<string | undefined>;
	createWorker?: WorkerFactory;
	rng?: () => number;
	now?: () => number;
	/** Handshake / readyok timeout. Default 30 s (the full net takes a while to load). */
	readyTimeoutMs?: number;
}

/** Safety net: send `stop` if a bounded search overruns its movetime by this much. */
const WATCHDOG_GRACE_MS = 5_000;

/**
 * Stockfish (or any UCI engine compiled to a Web Worker) behind `EngineAdapter`.
 *
 * All engine work runs through one FIFO queue so play/analyze/newGame never
 * interleave. A new play/analyze request preempts a running analysis (sends
 * `stop` and drains its `bestmove`) and drops analyses still waiting in the
 * queue. `stop()` aborts everything: running and queued jobs reject with
 * `EngineAbortError` (analyses just end).
 */
export class StockfishWorkerAdapter implements EngineAdapter {
	readonly capabilities: EngineCapabilities = { limitStrength: true, multiPv: true, analysis: true, ponder: false };
	private _status: EngineStatus = 'idle';
	private uci: UciEngine | null = null;
	private initPromise: Promise<void> | null = null;
	private readonly queue = new JobQueue();
	private readonly rng: () => number;
	private readonly now: () => number;

	constructor(
		readonly meta: EngineMeta,
		private readonly opts: StockfishWorkerOptions,
	) {
		this.rng = opts.rng ?? Math.random;
		this.now = opts.now ?? Date.now;
	}

	get status(): EngineStatus {
		return this._status;
	}

	/** Option names the engine announced (after init). */
	get supportedOptions(): ReadonlySet<string> {
		return this.uci?.options ?? new Set();
	}

	init(onProgress?: (fraction: number) => void): Promise<void> {
		if (this.initPromise) return this.initPromise;
		this._status = 'loading';
		this.initPromise = (async () => {
			try {
				const wasm = await this.opts.resolveWasmUrl?.();
				const url = wasm ? `${this.opts.scriptUrl}#${encodeURIComponent(wasm)}` : this.opts.scriptUrl;
				const worker = (this.opts.createWorker ?? defaultWorkerFactory)(url);
				const uci = new UciEngine(worker, () => {
					// Crashed worker: drop it so the next job starts a fresh one.
					this._status = 'error';
					if (this.uci === uci) {
						this.uci = null;
						this.initPromise = null;
					}
					uci.terminate();
				});
				this.uci = uci;
				try {
					await uci.handshake(this.opts.readyTimeoutMs);
				} finally {
					// The worker has fetched the wasm by now; free the (possibly ~95 MB) blob.
					if (wasm?.startsWith('blob:')) URL.revokeObjectURL(wasm);
				}
				onProgress?.(1);
				this._status = 'ready';
			} catch (err) {
				this._status = 'error';
				this.uci?.terminate();
				this.uci = null;
				this.initPromise = null;
				throw err;
			}
		})();
		return this.initPromise;
	}

	newGame(): void {
		void this.enqueue('cmd', async (uci) => {
			uci.send('ucinewgame');
			await uci.isReady(this.opts.readyTimeoutMs);
		}).catch(() => undefined);
	}

	play(pos: EnginePosition, opts: PlayOptions): Promise<PlayResult> {
		const started = this.now();
		const plan = resolveStrength(this.meta, opts.targetElo, opts.think);
		return this.enqueue('play', async (uci, job) => {
			await this.configure(uci, { ...plan.options, MultiPV: 1 });
			uci.send(buildPositionCommand(pos));
			const res = await this.search(uci, job, plan.go);
			if (job.cancelled) throw new EngineAbortError();
			if (!res.uci) throw new Error('engine returned no move (game over?)');
			const fen = plan.blunderChance > 0 ? fenAfter(pos) : null;
			const uciMove = fen ? pickBlunderMove(fen, res.uci, plan.blunderChance, this.rng) : res.uci;
			await waitMinDelay(started, plan.minDelayMs, this.now);
			if (job.cancelled) throw new EngineAbortError();
			const out: PlayResult = { uci: uciMove };
			if (res.info && uciMove === res.uci) out.info = res.info;
			return out;
		});
	}

	analyze(pos: EnginePosition, opts: AnalyzeOptions, onInfo: (info: EngineInfo) => void): () => void {
		let job: Job | null = null;
		const p = this.enqueue(
			'analyze',
			async (uci, j) => {
				await this.configure(uci, { UCI_LimitStrength: false, 'Skill Level': 20, MultiPV: Math.max(1, opts.multiPv) });
				uci.send(buildPositionCommand(pos));
				const go: GoLimits = opts.infinite || (opts.depth === undefined && opts.movetimeMs === undefined) ? { infinite: true } : {};
				if (!go.infinite) {
					if (opts.depth !== undefined) go.depth = opts.depth;
					if (opts.movetimeMs !== undefined) go.movetimeMs = opts.movetimeMs;
				}
				await this.search(uci, j, go, onInfo);
			},
			(j) => {
				job = j;
			},
		);
		p.catch(() => undefined);
		return () => {
			if (job) this.queue.cancel(job);
		};
	}

	stop(): void {
		this.queue.cancelAll();
	}

	dispose(): void {
		this.stop();
		this.uci?.terminate();
		this.uci = null;
		this.initPromise = null;
		this._status = 'idle';
	}

	// ── internals ────────────────────────────────────────────────────────

	private enqueue<T>(kind: JobKind, run: (uci: UciEngine, job: Job) => Promise<T>, onCreate?: (job: Job) => void): Promise<T> {
		return this.queue.enqueue(
			kind,
			async (job) => {
				try {
					await this.init();
					const uci = this.uci;
					if (!uci) throw new EngineAbortError('engine disposed');
					if (job.cancelled) throw new EngineAbortError();
					this._status = 'busy';
					return await run(uci, job);
				} finally {
					if (this._status === 'busy') this._status = 'ready';
				}
			},
			onCreate,
		);
	}

	/** Sends supported options only, then syncs with `isready`. */
	private async configure(uci: UciEngine, options: Record<string, string | number | boolean>): Promise<void> {
		const supported = Object.fromEntries(Object.entries(options).filter(([name]) => uci.options.size === 0 || uci.options.has(name)));
		for (const cmd of setOptionCommands(supported)) uci.send(cmd);
		await uci.isReady(this.opts.readyTimeoutMs);
	}

	/**
	 * Sends `go` and resolves on `bestmove`. Infos stream to `onInfo` until then.
	 * If the job was cancelled before `go`, skips the search entirely.
	 */
	private async search(
		uci: UciEngine,
		job: Job,
		go: GoLimits,
		onInfo?: (info: EngineInfo) => void,
	): Promise<{ uci: string | null; info?: EngineInfo }> {
		if (job.cancelled) return { uci: null };
		let best: EngineInfo | undefined;
		const off = uci.onLine((line) => {
			if (!line.startsWith('info')) return;
			const info = parseInfoLine(line);
			if (!info) return;
			if (info.multipv === 1 && !info.score.bound) best = info;
			if (!job.cancelled) onInfo?.(info);
		});
		const done = uci.waitFor((l) => l.startsWith('bestmove'));
		let watchdog: ReturnType<typeof setTimeout> | undefined;
		const stop = (): void => {
			if (!uci.failed) uci.send('stop');
		};
		try {
			job.onCancel = stop;
			uci.send(buildGoCommand(go));
			if (!go.infinite && go.movetimeMs !== undefined) watchdog = setTimeout(stop, go.movetimeMs + WATCHDOG_GRACE_MS);
			const line = await done;
			const bm = parseBestMove(line);
			return best ? { uci: bm?.uci ?? null, info: best } : { uci: bm?.uci ?? null };
		} finally {
			delete job.onCancel;
			if (watchdog) clearTimeout(watchdog);
			off();
		}
	}
}

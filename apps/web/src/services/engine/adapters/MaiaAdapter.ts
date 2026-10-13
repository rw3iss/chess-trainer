import {
	applyUci,
	pickBlunderMove,
	resolveStrength,
	turnFromFen,
	type AnalyzeOptions,
	type EngineAdapter,
	type EngineCapabilities,
	type EngineInfo,
	type EngineMeta,
	type EnginePosition,
	type EngineStatus,
	type PlayOptions,
	type PlayResult,
	type Uci,
} from '@chess/core';
import type { EngineAssetStore } from '../assetStore';
import { JobQueue } from '../jobQueue';
import { decodePolicy, eloCategory, encodePosition, sampleMove, valueToWinProb, winProbToCp, type PolicyMove } from '../maia/encode';
import { EngineAbortError } from '../types';
import { engineAssetUrl, fenAfter, waitMinDelay } from '../util';

/**
 * Maia-2 "rapid" ONNX (one model, Elo is an input; ~89 MB). Pinned to the
 * commit where CSSLab/maia-platform-frontend last shipped it (served with
 * CORS `*`). Self-host it for production and override via `modelUrl`.
 */
export const MAIA2_DEFAULT_MODEL_URL =
	'https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/e23a50e/public/maia2/maia_rapid.onnx';
export const MAIA2_MODEL_BYTES = 93_246_338;

/** Minimal slice of onnxruntime-web used here (keeps the import lazy + mockable). */
export interface OrtTensorLike {
	data: ArrayLike<number> | ArrayLike<bigint>;
}
export interface OrtSessionLike {
	run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensorLike>>;
	release?(): Promise<void>;
}
export interface OrtLike {
	env: { wasm: { numThreads?: number; wasmPaths?: unknown } };
	Tensor: new (type: string, data: Float32Array | BigInt64Array, dims?: readonly number[]) => unknown;
	InferenceSession: { create(model: ArrayBuffer | Uint8Array, opts?: Record<string, unknown>): Promise<OrtSessionLike> };
}

export interface MaiaAdapterOptions {
	store: EngineAssetStore;
	/** URL the model is downloaded from and cached under. */
	modelUrl?: string;
	/** Move vocabulary (1880 entries) — shipped in public/engines/maia/all_moves.json. */
	movesUrl?: string;
	/** Defaults to `import('onnxruntime-web/wasm')`. */
	loadOrt?: () => Promise<OrtLike>;
	/** Opponent rating fed to `elo_oppo` (defaults to the bot's own rating). */
	opponentElo?: number;
	/**
	 * Maia-2 was trained with plies 0–9 skipped (`first_n_moves: 10`), so its
	 * opening moves are poor (e.g. 1.Na3). For plies < MAIA2_FIRST_PLY this hook
	 * may return a book move (e.g. weighted pick from the openings dataset /
	 * explorer). Null / illegal → Maia's own move.
	 */
	openingMove?: (fen: string, ply: number) => Uci | null | undefined | Promise<Uci | null | undefined>;
	rng?: () => number;
	now?: () => number;
	fetchFn?: typeof fetch;
}

/** First ply Maia-2 saw in training. */
export const MAIA2_FIRST_PLY = 10;

/** Ply number (0 = White's first move) from a FEN's fullmove counter + side to move. */
export function plyFromFen(fen: string): number {
	const parts = fen.trim().split(/\s+/);
	const full = Number.parseInt(parts[5] ?? '1', 10) || 1;
	return (full - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
}

const loadOrtDefault = async (): Promise<OrtLike> => (await import('onnxruntime-web/wasm')) as unknown as OrtLike;

/**
 * Human-like bot using the Maia-2 policy network. No search: one network
 * evaluation per move, then temperature sampling over legal moves.
 * `init()` fails with status 'unavailable' ("model not downloaded") until the
 * model is in Cache Storage (registry.download('maia') or importModel()).
 */
export class MaiaAdapter implements EngineAdapter {
	readonly capabilities: EngineCapabilities = { limitStrength: true, multiPv: true, analysis: false, ponder: false };
	readonly modelUrl: string;
	private _status: EngineStatus = 'idle';
	private session: OrtSessionLike | null = null;
	private ort: OrtLike | null = null;
	private vocab: Record<string, number> | null = null;
	private initPromise: Promise<void> | null = null;
	private readonly queue = new JobQueue();
	private readonly rng: () => number;
	private readonly now: () => number;

	constructor(
		readonly meta: EngineMeta,
		private readonly opts: MaiaAdapterOptions,
	) {
		this.modelUrl = opts.modelUrl ?? MAIA2_DEFAULT_MODEL_URL;
		this.rng = opts.rng ?? Math.random;
		this.now = opts.now ?? Date.now;
	}

	get status(): EngineStatus {
		return this._status;
	}

	/** Reason shown when status is 'unavailable'. */
	unavailableReason: string | undefined;

	/** Is the model in Cache Storage? */
	isModelCached(): Promise<boolean> {
		return this.opts.store.has([this.modelUrl]);
	}

	/** Stores a user-picked .onnx file as the model. */
	async importModel(file: Blob): Promise<void> {
		await this.opts.store.importBlob(this.modelUrl, file);
		if (this._status === 'unavailable') this._status = 'idle';
	}

	init(onProgress?: (fraction: number) => void): Promise<void> {
		if (this.initPromise) return this.initPromise;
		this._status = 'loading';
		this.initPromise = (async () => {
			try {
				const model = await this.opts.store.arrayBuffer(this.modelUrl);
				if (!model) {
					this._status = 'unavailable';
					this.unavailableReason = 'model not downloaded';
					throw new Error('Maia: model not downloaded');
				}
				const fetchFn = this.opts.fetchFn ?? fetch;
				const [ort, vocab] = await Promise.all([
					(this.opts.loadOrt ?? loadOrtDefault)(),
					fetchFn(this.opts.movesUrl ?? engineAssetUrl('maia/all_moves.json')).then((r) => {
						if (!r.ok) throw new Error(`Maia: move vocabulary HTTP ${r.status}`);
						return r.json() as Promise<Record<string, number>>;
					}),
				]);
				const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1;
				const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
				ort.env.wasm.numThreads = isolated ? Math.min(4, hc) : 1;
				this.session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'] });
				this.ort = ort;
				this.vocab = vocab;
				onProgress?.(1);
				this._status = 'ready';
				this.unavailableReason = undefined;
			} catch (err) {
				if (this._status !== 'unavailable') this._status = 'error';
				this.initPromise = null;
				throw err;
			}
		})();
		return this.initPromise;
	}

	newGame(): void {
		/* stateless */
	}

	/** Full move distribution for a position (sorted, real-frame UCI) + White win probability. */
	async evaluate(fen: string, eloSelf: number, eloOppo = eloSelf): Promise<{ policy: PolicyMove[]; whiteWinProb: number }> {
		await this.init();
		const { session, ort, vocab } = this;
		if (!session || !ort || !vocab) throw new EngineAbortError('engine disposed');
		const input = encodePosition(fen);
		const out = await session.run({
			boards: new ort.Tensor('float32', input.boards, [1, 18, 8, 8]),
			elo_self: new ort.Tensor('int64', BigInt64Array.from([BigInt(eloCategory(eloSelf))]), [1]),
			elo_oppo: new ort.Tensor('int64', BigInt64Array.from([BigInt(eloCategory(eloOppo))]), [1]),
		});
		const logits = out.logits_maia?.data as ArrayLike<number> | undefined;
		const value = out.logits_value?.data as ArrayLike<number> | undefined;
		if (!logits) throw new Error('Maia: model output logits_maia missing');
		const stm = valueToWinProb(Number(value?.[0] ?? 0));
		return { policy: decodePolicy(logits, input, vocab), whiteWinProb: input.mirrored ? 1 - stm : stm };
	}

	play(pos: EnginePosition, opts: PlayOptions): Promise<PlayResult> {
		const started = this.now();
		const plan = resolveStrength(this.meta, opts.targetElo, opts.think);
		const elo = opts.targetElo ?? this.meta.eloRange[1];
		return this.queue.enqueue('play', async (job) => {
			const fen = fenAfter(pos);
			if (!fen) throw new Error('Maia: illegal move in position');
			const book = await this.bookMove(fen);
			if (job.cancelled) throw new EngineAbortError();
			if (book) {
				await waitMinDelay(started, plan.minDelayMs, this.now);
				if (job.cancelled) throw new EngineAbortError();
				return { uci: book };
			}
			const { policy, whiteWinProb } = await this.evaluate(fen, elo, this.opts.opponentElo ?? elo);
			if (job.cancelled) throw new EngineAbortError();
			const pick = sampleMove(policy, plan.temperature ?? 0, this.rng);
			if (!pick) throw new Error('engine returned no move (game over?)');
			const uci = pickBlunderMove(fen, pick.uci, plan.blunderChance, this.rng);
			await waitMinDelay(started, plan.minDelayMs, this.now);
			if (job.cancelled) throw new EngineAbortError();
			const res: PlayResult = { uci };
			if (uci === pick.uci) res.info = this.toInfo(fen, pick, 1, whiteWinProb);
			return res;
		});
	}

	/** One-shot: emits the top `multiPv` policy moves (no search, depth 0). */
	analyze(pos: EnginePosition, opts: AnalyzeOptions, onInfo: (info: EngineInfo) => void): () => void {
		let cancelled = false;
		const elo = this.opts.opponentElo ?? this.meta.eloRange[1];
		void this.queue
			.enqueue('analyze', async (job) => {
				const fen = fenAfter(pos);
				if (!fen) return;
				const { policy, whiteWinProb } = await this.evaluate(fen, elo);
				if (cancelled || job.cancelled) return;
				policy.slice(0, Math.max(1, opts.multiPv)).forEach((m, i) => onInfo(this.toInfo(fen, m, i + 1, whiteWinProb)));
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}

	stop(): void {
		this.queue.cancelAll();
	}

	dispose(): void {
		this.stop();
		void this.session?.release?.();
		this.session = null;
		this.initPromise = null;
		this._status = 'idle';
	}

	private async bookMove(fen: string): Promise<Uci | null> {
		const ply = plyFromFen(fen);
		if (!this.opts.openingMove || ply >= MAIA2_FIRST_PLY) return null;
		const uci = await this.opts.openingMove(fen, ply);
		return uci && applyUci(fen, uci) ? uci : null;
	}

	private toInfo(fen: string, m: PolicyMove, multipv: number, whiteWinProb: number): EngineInfo {
		const stm = turnFromFen(fen) === 'white' ? whiteWinProb : 1 - whiteWinProb;
		return { depth: 0, multipv, score: { cp: winProbToCp(stm) }, pv: [m.uci], policy: m.prob };
	}
}

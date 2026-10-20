import {
	envelope,
	EngineEvents,
	type AnalyzeOptions,
	type EngineAdapter,
	type EngineBestMovePayload,
	type EngineCapabilities,
	type EngineInfo,
	type EngineInfoPayload,
	type EngineMeta,
	type EnginePosition,
	type EngineStartResult,
	type EngineStatus,
	type PlayOptions,
	type PlayResult,
	type WsAck,
	type WsEnvelope,
} from '@chess/core';
import { JobQueue, type Job } from '../jobQueue';
import { EngineAbortError } from '../types';
import { socketTarget } from '@/services/server/socketTarget';

/** The slice of a socket.io client socket used here. */
export interface SocketLike {
	readonly connected: boolean;
	on(event: string, fn: (...args: any[]) => void): unknown;
	off(event: string, fn?: (...args: any[]) => void): unknown;
	emit(event: string, ...args: unknown[]): unknown;
	connect(): unknown;
	disconnect(): unknown;
}

export type SocketFactory = (url: string, opts: { auth: (cb: (data: object) => void) => void }) => SocketLike | Promise<SocketLike>;

export interface RemoteEngineOptions {
	/** Server base URL, e.g. 'https://chess.example.com' (no trailing namespace). */
	serverUrl: string;
	/** Access token (or a getter, re-read on every reconnect). */
	token?: string | (() => string | undefined);
	/** Defaults to a lazy `import('socket.io-client')`. */
	createSocket?: SocketFactory;
	/** Ack timeout per command. */
	ackTimeoutMs?: number;
	/** How long to wait for the final bestmove after `stop` before giving up. */
	drainTimeoutMs?: number;
}

const defaultSocketFactory: SocketFactory = async (url, opts) => {
	const { io } = await import('socket.io-client');
	const t = socketTarget(url);
	return io(t.url, { ...opts, path: t.path, transports: ['websocket', 'polling'], reconnection: true }) as unknown as SocketLike;
};

interface Pending {
	resolve: (p: EngineBestMovePayload) => void;
	reject: (e: Error) => void;
	onInfo?: (info: EngineInfo) => void;
}

/**
 * Engine running on the server, streamed over socket.io namespace `/engine`
 * (core EngineEvents + WsEnvelope; every command acked with WsAck).
 * Strength (UCI_Elo, blunder blend, min delay) is applied server-side.
 *
 * Reconnects: socket.io reconnects automatically; the server drops engine
 * sessions on disconnect, so the session is re-created lazily and an
 * in-flight play rejects (the BotPlayer retries on the next position tick).
 */
export class RemoteEngineAdapter implements EngineAdapter {
	readonly capabilities: EngineCapabilities;
	private _status: EngineStatus = 'idle';
	private socket: SocketLike | null = null;
	private sessionId: string | null = null;
	private sessionPromise: Promise<string> | null = null;
	private initPromise: Promise<void> | null = null;
	private pending: Pending | null = null;
	private readonly queue = new JobQueue();
	private readonly ackTimeoutMs: number;
	private readonly drainTimeoutMs: number;

	constructor(
		readonly meta: EngineMeta,
		private readonly opts: RemoteEngineOptions,
	) {
		const searchEngine = meta.family !== 'maia';
		this.capabilities = { limitStrength: true, multiPv: searchEngine, analysis: searchEngine, ponder: false };
		this.ackTimeoutMs = opts.ackTimeoutMs ?? 10_000;
		this.drainTimeoutMs = opts.drainTimeoutMs ?? 3_000;
	}

	get status(): EngineStatus {
		return this._status;
	}

	init(onProgress?: (fraction: number) => void): Promise<void> {
		if (this.initPromise) return this.initPromise;
		this._status = 'loading';
		this.initPromise = (async () => {
			try {
				const url = `${this.opts.serverUrl.replace(/\/+$/, '')}/engine`;
				const socket = await (this.opts.createSocket ?? defaultSocketFactory)(url, {
					auth: (cb) => {
						const t = typeof this.opts.token === 'function' ? this.opts.token() : this.opts.token;
						cb(t ? { token: t } : {});
					},
				});
				this.socket = socket;
				this.wire(socket);
				if (!socket.connected) {
					await new Promise<void>((resolve, reject) => {
						const ok = (): void => {
							socket.off('connect_error', bad);
							resolve();
						};
						const bad = (err: Error): void => {
							socket.off('connect', ok);
							reject(new Error(`engine server unreachable: ${err?.message ?? 'connect error'}`));
						};
						socket.on('connect', ok);
						socket.on('connect_error', bad);
						socket.connect();
					});
				}
				await this.ensureSession();
				onProgress?.(1);
				this._status = 'ready';
			} catch (err) {
				this._status = 'error';
				this.socket?.disconnect();
				this.socket = null;
				this.initPromise = null;
				throw err;
			}
		})();
		return this.initPromise;
	}

	newGame(): void {
		/* server sessions send ucinewgame on start; nothing to do between games */
	}

	play(pos: EnginePosition, opts: PlayOptions): Promise<PlayResult> {
		return this.run('play', pos, (sid) => ({ engineSessionId: sid, mode: 'play' as const, play: opts })).then((bm) => {
			const res: PlayResult = { uci: bm.uci };
			if (bm.info) res.info = bm.info;
			return res;
		});
	}

	analyze(pos: EnginePosition, opts: AnalyzeOptions, onInfo: (info: EngineInfo) => void): () => void {
		let job: Job | null = null;
		this.run('analyze', pos, (sid) => ({ engineSessionId: sid, mode: 'analyze' as const, analyze: opts }), onInfo, (j) => {
			job = j;
		}).catch(() => undefined);
		return () => {
			if (job) this.queue.cancel(job);
		};
	}

	stop(): void {
		this.queue.cancelAll();
	}

	dispose(): void {
		this.stop();
		if (this.socket && this.sessionId) {
			this.socket.emit(EngineEvents.close, envelope(EngineEvents.close, { engineSessionId: this.sessionId }));
		}
		this.pending?.reject(new EngineAbortError('engine disposed'));
		this.pending = null;
		this.socket?.disconnect();
		this.socket = null;
		this.sessionId = null;
		this.sessionPromise = null;
		this.initPromise = null;
		this._status = 'idle';
	}

	// ── internals ────────────────────────────────────────────────────────

	private run(
		kind: 'play' | 'analyze',
		pos: EnginePosition,
		goPayload: (sid: string) => object,
		onInfo?: (info: EngineInfo) => void,
		onCreate?: (job: Job) => void,
	): Promise<EngineBestMovePayload> {
		return this.queue.enqueue(
			kind,
			async (job) => {
				await this.init();
				if (job.cancelled) throw new EngineAbortError();
				const sid = await this.ensureSession();
				this._status = 'busy';
				try {
					await this.request(EngineEvents.position, { engineSessionId: sid, fen: pos.fen, moves: pos.moves });
					if (job.cancelled) throw new EngineAbortError();
					const done = new Promise<EngineBestMovePayload>((resolve, reject) => {
						this.pending = onInfo ? { resolve, reject, onInfo } : { resolve, reject };
					});
					job.onCancel = () => {
						this.request(EngineEvents.stop, { engineSessionId: sid }).catch(() => undefined);
						// Do not hang forever if the server never sends the final bestmove.
						setTimeout(() => this.pending?.reject(new EngineAbortError()), this.drainTimeoutMs);
					};
					await this.request(EngineEvents.go, goPayload(sid));
					const bm = await done;
					if (job.cancelled && kind === 'play') throw new EngineAbortError();
					return bm;
				} finally {
					delete job.onCancel;
					this.pending = null;
					if (this._status === 'busy') this._status = 'ready';
				}
			},
			onCreate,
		);
	}

	private ensureSession(): Promise<string> {
		if (this.sessionId) return Promise.resolve(this.sessionId);
		if (!this.sessionPromise) {
			this.sessionPromise = this.request<EngineStartResult>(EngineEvents.start, { engineId: this.meta.id })
				.then((r) => {
					this.sessionId = r.engineSessionId;
					return r.engineSessionId;
				})
				.finally(() => {
					this.sessionPromise = null;
				});
		}
		return this.sessionPromise;
	}

	private request<T = unknown>(type: string, payload: unknown): Promise<T> {
		const socket = this.socket;
		if (!socket?.connected) return Promise.reject(new Error('engine server disconnected'));
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`${type}: no ack within ${this.ackTimeoutMs} ms`)), this.ackTimeoutMs);
			socket.emit(type, envelope(type, payload), (ack: WsAck<T>) => {
				clearTimeout(timer);
				if (ack?.ok) resolve(ack.data as T);
				else reject(new Error(ack?.error?.message ?? `${type} failed`));
			});
		});
	}

	private wire(socket: SocketLike): void {
		socket.on(EngineEvents.info, (msg: WsEnvelope<EngineInfoPayload>) => {
			if (msg?.payload?.engineSessionId === this.sessionId) this.pending?.onInfo?.(msg.payload.info);
		});
		socket.on(EngineEvents.bestmove, (msg: WsEnvelope<EngineBestMovePayload>) => {
			if (msg?.payload?.engineSessionId === this.sessionId) this.pending?.resolve(msg.payload);
		});
		socket.on(EngineEvents.error, (msg: WsEnvelope<{ engineSessionId: string; message: string }>) => {
			const p = msg?.payload;
			if (!p) return;
			if (!p.engineSessionId || p.engineSessionId === this.sessionId) this.pending?.reject(new Error(p.message));
		});
		socket.on(EngineEvents.close, (msg: WsEnvelope<{ engineSessionId: string }>) => {
			if (msg?.payload?.engineSessionId === this.sessionId) {
				this.sessionId = null;
				this.pending?.reject(new Error('engine session closed by server'));
			}
		});
		socket.on('disconnect', () => {
			// Server closes the owner's sessions on disconnect.
			this.sessionId = null;
			this.pending?.reject(new Error('engine server disconnected'));
			if (this._status !== 'idle') this._status = 'loading';
		});
		socket.on('connect', () => {
			if (this._status === 'loading' && this.initPromise) this._status = 'ready';
		});
	}
}

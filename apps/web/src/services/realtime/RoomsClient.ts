// RoomsClient — socket.io client for the server's '/play' namespace (PLAN phase 13).
// Framework-free (signals only). Every command is a versioned WsEnvelope sent with an
// ack callback; the ack is a WsAck { ok, data?, error }. Server events arrive as
// envelopes and are fanned out to onEvent() listeners.
//
// Reconnect: socket.io reconnects by itself; on every re-connect we re-join the rooms
// we were in and emit a synthetic 'resync' event with the fresh RoomState so the store
// can rebuild. Moves keep their envelope id across retries (server idempotency key).
import { signal, type ReadonlySignal } from '@preact/signals';
import { newId } from '@chess/core/chess';
import {
	PROTOCOL_VERSION,
	RoomEvents,
	envelope,
	type ChatMessage,
	type GameMovedPayload,
	type PlayerInfo,
	type RoomCreatePayload,
	type RoomJoinResult,
	type RoomState,
	type WsAck,
	type WsEnvelope,
} from '@chess/core/protocol';
import type { GameResult, Uci } from '@chess/core/chess';
import { socketTarget } from '@/services/server/socketTarget';

export const ACK_TIMEOUT_MS = 8000;
export const PLAY_NAMESPACE = '/play';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/** Minimal socket surface we use (socket.io-client Socket satisfies it; tests pass a fake). */
export interface SocketLike {
	readonly connected: boolean;
	on(event: string, fn: (...args: never[]) => void): unknown;
	off(event: string, fn?: (...args: never[]) => void): unknown;
	emit(event: string, ...args: unknown[]): unknown;
	connect(): unknown;
	disconnect(): unknown;
}

export interface SocketFactoryOptions {
	/** Called on every (re)connect handshake; must resolve the bearer token. */
	auth: (cb: (data: { token: string }) => void) => void;
}

export type SocketFactory = (url: string, opts: SocketFactoryOptions) => SocketLike | Promise<SocketLike>;

/** Events delivered to listeners (server broadcasts + client-side 'resync' / 'connection'). */
export type RoomEvent =
	| { type: 'state'; room: RoomState }
	| { type: 'moved'; payload: GameMovedPayload }
	| { type: 'ended'; roomId: string; result: GameResult; room: RoomState }
	| { type: 'chat'; message: ChatMessage }
	| { type: 'presence'; roomId: string; players: RoomState['players']; spectators: PlayerInfo[] }
	| { type: 'action'; roomId: string; action: string; payload: unknown; from: string }
	| { type: 'resync'; room: RoomState }
	| { type: 'auth-error'; code: string; message: string };

export class RoomError extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = 'RoomError';
	}
}

export interface RoomsClientOptions {
	/** Server base URL (http[s]://host:port). */
	url: () => string | null;
	/** Bearer token for the handshake (user or guest). */
	getToken: () => Promise<string>;
	/** Defaults to a lazy `import('socket.io-client')`. */
	socketFactory?: SocketFactory;
	ackTimeoutMs?: number;
}

const defaultFactory: SocketFactory = async (url, opts) => {
	const { io } = await import('socket.io-client');
	const t = socketTarget(`${url}${PLAY_NAMESPACE}`);
	return io(t.url, {
		path: t.path,
		auth: opts.auth,
		transports: ['websocket', 'polling'],
		reconnectionDelay: 500,
		reconnectionDelayMax: 5000,
	}) as unknown as SocketLike;
};

export class RoomsClient {
	private socket: SocketLike | null = null;
	private socketUrl: string | null = null;
	private connecting: Promise<SocketLike> | null = null;
	private readonly joined = new Set<string>();
	private readonly listeners = new Set<(e: RoomEvent) => void>();
	private everConnected = false;
	private readonly _status = signal<ConnectionStatus>('idle');

	readonly status: ReadonlySignal<ConnectionStatus> = this._status;

	constructor(private readonly opts: RoomsClientOptions) {}

	onEvent(fn: (e: RoomEvent) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	// ── Commands ─────────────────────────────────────────────────────────────
	async create(payload: RoomCreatePayload): Promise<RoomJoinResult> {
		const res = await this.request<RoomJoinResult>(RoomEvents.create, payload);
		this.joined.add(res.room.id);
		return res;
	}

	async join(roomId: string): Promise<RoomJoinResult> {
		const res = await this.request<RoomJoinResult>(RoomEvents.join, { roomId });
		this.joined.add(roomId);
		return res;
	}

	async leave(roomId: string): Promise<void> {
		this.joined.delete(roomId);
		if (!this.socket?.connected) return;
		await this.request<null>(RoomEvents.leave, { roomId }).catch(() => undefined);
	}

	resync(roomId: string): Promise<RoomState> {
		return this.request<RoomState>(RoomEvents.resync, { roomId });
	}

	/** `id` is the idempotency key — reuse it when retrying the same move. */
	move(roomId: string, uci: Uci, id: string = newId()): Promise<GameMovedPayload> {
		return this.request<GameMovedPayload>(RoomEvents.move, { roomId, uci }, id);
	}

	resign(roomId: string): Promise<GameResult> {
		return this.request<GameResult>(RoomEvents.resign, { roomId });
	}

	offerDraw(roomId: string): Promise<RoomState> {
		return this.request<RoomState>(RoomEvents.drawOffer, { roomId });
	}

	answerDraw(roomId: string, accept: boolean): Promise<RoomState> {
		return this.request<RoomState>(RoomEvents.drawAnswer, { roomId, accept });
	}

	chat(roomId: string, text: string): Promise<ChatMessage> {
		return this.request<ChatMessage>(RoomEvents.chat, { roomId, text });
	}

	/** Generic extension point: relayed to everyone else in the room. */
	action<T>(roomId: string, type: string, payload: T): Promise<null> {
		return this.request<null>(RoomEvents.action, { roomId, type, payload });
	}

	/** Close the socket and forget joined rooms. */
	disconnect(): void {
		this.joined.clear();
		this.socket?.disconnect();
		this.socket = null;
		this.socketUrl = null;
		this.connecting = null;
		this.everConnected = false;
		this._status.value = 'idle';
	}

	// ── Transport ────────────────────────────────────────────────────────────
	async request<T>(type: string, payload: unknown, id: string = newId()): Promise<T> {
		const socket = await this.ensureSocket();
		const env: WsEnvelope = envelope(type, payload, id);
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => reject(new RoomError('TIMEOUT', 'The server did not answer in time.')), this.opts.ackTimeoutMs ?? ACK_TIMEOUT_MS);
			socket.emit(type, env, (ack: WsAck<T>) => {
				clearTimeout(timer);
				if (ack?.ok) resolve(ack.data as T);
				else reject(new RoomError(ack?.error?.code ?? 'INTERNAL_ERROR', ack?.error?.message ?? 'Request failed'));
			});
		});
	}

	private emitEvent(e: RoomEvent): void {
		this.listeners.forEach((fn) => fn(e));
	}

	private ensureSocket(): Promise<SocketLike> {
		const url = this.opts.url();
		if (!url) return Promise.reject(new RoomError('UNCONFIGURED', 'No server configured.'));
		if (this.socket && this.socketUrl === url) {
			if (this.socket.connected) return Promise.resolve(this.socket);
			return this.waitConnected(this.socket);
		}
		if (this.connecting && this.socketUrl === url) return this.connecting;
		if (this.socket) this.disconnect();
		this.socketUrl = url;
		this._status.value = 'connecting';
		this.connecting = (async () => {
			const factory = this.opts.socketFactory ?? defaultFactory;
			const socket = await factory(url, {
				auth: (cb) => {
					this.opts.getToken().then(
						(token) => cb({ token }),
						() => cb({ token: '' }),
					);
				},
			});
			this.socket = socket;
			this.wire(socket);
			if (!socket.connected) socket.connect();
			return this.waitConnected(socket);
		})();
		this.connecting.catch(() => undefined).finally(() => (this.connecting = null));
		return this.connecting;
	}

	private waitConnected(socket: SocketLike): Promise<SocketLike> {
		if (socket.connected) return Promise.resolve(socket);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				cleanup();
				this._status.value = 'error';
				reject(new RoomError('UNAVAILABLE', 'Could not reach the game server.'));
			}, this.opts.ackTimeoutMs ?? ACK_TIMEOUT_MS);
			const onConnect = () => {
				cleanup();
				resolve(socket);
			};
			const onError = (err: { code?: string; message?: string }) => {
				cleanup();
				reject(new RoomError(err?.code ?? 'UNAUTHORIZED', err?.message ?? 'Connection refused.'));
			};
			const cleanup = () => {
				clearTimeout(timer);
				socket.off('connect', onConnect);
				socket.off('error', onError);
			};
			socket.on('connect', onConnect);
			socket.on('error', onError);
		});
	}

	private wire(socket: SocketLike): void {
		socket.on('connect', () => {
			this._status.value = 'connected';
			const isReconnect = this.everConnected;
			this.everConnected = true;
			if (isReconnect) void this.rejoin();
		});
		socket.on('disconnect', () => {
			if (this.socket === socket) this._status.value = 'reconnecting';
		});
		socket.on('connect_error', () => {
			this._status.value = this.everConnected ? 'reconnecting' : 'error';
		});
		socket.on('error', (err: { code?: string; message?: string }) => {
			this._status.value = 'error';
			this.emitEvent({ type: 'auth-error', code: err?.code ?? 'UNAUTHORIZED', message: err?.message ?? 'Connection refused.' });
		});
		const on = <T>(event: string, fn: (payload: T) => void) =>
			socket.on(event, (env: WsEnvelope<T>) => {
				if (!env || env.v !== PROTOCOL_VERSION) return;
				fn(env.payload);
			});
		on<RoomState>(RoomEvents.state, (room) => this.emitEvent({ type: 'state', room }));
		on<GameMovedPayload>(RoomEvents.moved, (payload) => this.emitEvent({ type: 'moved', payload }));
		on<{ roomId: string; result: GameResult; room: RoomState }>(RoomEvents.ended, (p) => this.emitEvent({ type: 'ended', ...p }));
		on<ChatMessage>(RoomEvents.chat, (message) => this.emitEvent({ type: 'chat', message }));
		on<{ roomId: string; players: RoomState['players']; spectators: PlayerInfo[] }>(RoomEvents.presence, (p) =>
			this.emitEvent({ type: 'presence', ...p }),
		);
		on<{ roomId: string; type: string; payload: unknown; from: string }>(RoomEvents.action, (p) =>
			this.emitEvent({ type: 'action', roomId: p.roomId, action: p.type, payload: p.payload, from: p.from }),
		);
	}

	/** After a reconnect: re-join every room (restores the seat) and hand the fresh state to listeners. */
	private async rejoin(): Promise<void> {
		await Promise.all(
			Array.from(this.joined, async (roomId) => {
				try {
					const res = await this.request<RoomJoinResult>(RoomEvents.join, { roomId });
					this.emitEvent({ type: 'resync', room: res.room });
				} catch {
					/* room gone (server restart without Redis) — the store shows the error on next action */
				}
			}),
		);
	}
}

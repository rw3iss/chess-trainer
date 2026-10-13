// In-memory socket.io stand-in for RoomsClient tests. `server` handlers answer
// commands (return data or throw { code, message }); `push()` simulates broadcasts.
import { PROTOCOL_VERSION, type WsAck, type WsEnvelope } from '@chess/core/protocol';
import type { SocketLike } from '../RoomsClient';

type Handler = (env: WsEnvelope) => unknown;
type Listener = (...args: never[]) => void;

export class FakeSocket implements SocketLike {
	connected = false;
	readonly sent: WsEnvelope[] = [];
	readonly server = new Map<string, Handler>();
	private listeners = new Map<string, Set<Listener>>();
	/** When false, commands are swallowed (no ack) — to test timeouts. */
	answer = true;
	authToken: string | null = null;

	constructor(private auth?: (cb: (d: { token: string }) => void) => void) {}

	on(event: string, fn: Listener): this {
		if (!this.listeners.has(event)) this.listeners.set(event, new Set());
		this.listeners.get(event)!.add(fn);
		return this;
	}

	off(event: string, fn?: Listener): this {
		if (fn) this.listeners.get(event)?.delete(fn);
		else this.listeners.delete(event);
		return this;
	}

	emit(event: string, ...args: unknown[]): this {
		const env = args[0] as WsEnvelope;
		const ack = args[1] as ((a: WsAck) => void) | undefined;
		this.sent.push(env);
		if (!this.answer) return this;
		const h = this.server.get(event);
		queueMicrotask(() => {
			try {
				const data = h ? h(env) : null;
				ack?.({ ok: true, data });
			} catch (e) {
				const err = e as { code?: string; message?: string };
				ack?.({ ok: false, error: { code: err.code ?? 'INTERNAL_ERROR', message: err.message ?? 'error' } });
			}
		});
		return this;
	}

	connect(): this {
		this.auth?.((d) => {
			this.authToken = d.token;
			queueMicrotask(() => this.fire('connect'));
		});
		if (!this.auth) queueMicrotask(() => this.fire('connect'));
		return this;
	}

	disconnect(): this {
		this.connected = false;
		this.fire('disconnect', 'io client disconnect');
		return this;
	}

	/** Simulate a dropped connection followed by an automatic reconnect. */
	async dropAndReconnect(): Promise<void> {
		this.connected = false;
		this.fire('disconnect', 'transport close');
		await Promise.resolve();
		this.connect();
	}

	/** Server → client broadcast. */
	push<T>(type: string, payload: T): void {
		const env: WsEnvelope<T> = { v: PROTOCOL_VERSION, type, id: `srv-${Math.random()}`, payload };
		this.fire(type, env);
	}

	private fire(event: string, ...args: unknown[]): void {
		if (event === 'connect') this.connected = true;
		for (const fn of Array.from(this.listeners.get(event) ?? [])) (fn as (...a: unknown[]) => void)(...args);
	}
}

import { Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { envelope, PROTOCOL_VERSION, type WsAck, type WsEnvelope } from '@chess/core';
import type { AuthUser } from '../auth/auth-user';

/** Error surfaced to the client as `{ ok: false, error: { code, message } }`. */
export class WsError extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

/** Validates the `{ v, type, id, payload }` envelope every client command must use. */
export function unwrap<T>(msg: unknown): { id: string; payload: T } {
	const m = msg as Partial<WsEnvelope<T>> | null;
	if (!m || typeof m !== 'object' || m.v !== PROTOCOL_VERSION || typeof m.id !== 'string' || !m.id || m.payload === undefined) {
		throw new WsError('BAD_ENVELOPE', `expected { v: ${PROTOCOL_VERSION}, type, id, payload }`);
	}
	return { id: m.id, payload: m.payload as T };
}

const logger = new Logger('WS');

/**
 * Runs a handler and converts its outcome into a `WsAck` (returned to the
 * client's ack callback by Nest). Unexpected errors are logged and masked.
 */
export async function ack<T>(fn: () => T | Promise<T>): Promise<WsAck<T>> {
	try {
		return { ok: true, data: await fn() };
	} catch (err) {
		if (err instanceof WsError) return { ok: false, error: { code: err.code, message: err.message } };
		logger.error((err as Error).stack ?? String(err));
		return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'internal error' } };
	}
}

/** Emits an enveloped server event to one socket / room target. */
export function emitEnvelope<T>(target: { emit: (ev: string, ...args: unknown[]) => unknown }, type: string, payload: T): void {
	target.emit(type, envelope(type, payload));
}

/** Token from the socket.io handshake: `auth.token`, or `Authorization: Bearer …` header. */
export function handshakeToken(client: Socket): string | undefined {
	const t = (client.handshake.auth as { token?: unknown } | undefined)?.token;
	if (typeof t === 'string' && t) return t;
	const h = client.handshake.headers.authorization;
	return h?.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
}

export function socketUser(client: Socket): AuthUser {
	const u = client.data.user as AuthUser | undefined;
	if (!u) throw new WsError('UNAUTHORIZED', 'not authenticated');
	return u;
}

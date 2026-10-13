import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { envelope, type WsAck } from '@chess/core';

export interface TestApp {
	app: INestApplication;
	url: string;
	close: () => Promise<void>;
}

/**
 * Boots the full AppModule (SQLite :memory:, in-memory cache) on a random port.
 * `env` is applied to process.env *before* the app modules are imported, because
 * ConfigModule validates env at import time.
 */
export async function bootApp(env: Record<string, string> = {}): Promise<TestApp> {
	Object.assign(process.env, env);
	const { AppModule } = await import('../../src/app.module');
	const { configureApp } = await import('../../src/bootstrap');
	const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
	const app = mod.createNestApplication({ logger: ['error'] });
	configureApp(app, { quiet: true });
	await app.listen(0, '127.0.0.1');
	const { port } = app.getHttpServer().address() as AddressInfo;
	return { app, url: `http://127.0.0.1:${port}`, close: () => app.close() };
}

export async function ownerToken(app: INestApplication): Promise<string> {
	const res = await request(app.getHttpServer()).post('/auth/login').send({ username: 'owner', password: 'owner-pass' });
	return res.body.data.accessToken as string;
}

export async function guestToken(app: INestApplication, displayName: string): Promise<{ token: string; id: string }> {
	const res = await request(app.getHttpServer()).post('/auth/guest').send({ displayName });
	return { token: res.body.data.accessToken, id: res.body.data.user.id };
}

/** Connects a socket.io client to a namespace and waits for the connection. */
export function connect(url: string, nsp: string, token?: string): Promise<Socket> {
	return new Promise((resolve, reject) => {
		const s = io(url + nsp, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, forceNew: true });
		s.once('connect', () => resolve(s));
		s.once('connect_error', reject);
	});
}

/**
 * Connects and resolves with the first enveloped `type` event plus whether the
 * server then dropped the socket (used for handshake rejection tests).
 */
export function connectExpectingRejection(url: string, nsp: string, type: string, token?: string): Promise<{ payload: any; disconnected: boolean }> {
	return new Promise((resolve, reject) => {
		const s = io(url + nsp, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, forceNew: true });
		let payload: any;
		const timer = setTimeout(() => {
			s.disconnect();
			reject(new Error('server did not reject the socket'));
		}, 5000);
		s.on(type, (env: { payload?: unknown }) => (payload = env?.payload ?? env));
		s.on('disconnect', () => {
			clearTimeout(timer);
			resolve({ payload, disconnected: true });
		});
	});
}

let seq = 0;
/** Emits an enveloped command and resolves with the server's ack. */
export function send<T = unknown>(s: Socket, type: string, payload: unknown, id = `t${++seq}`): Promise<WsAck<T>> {
	return s.timeout(10_000).emitWithAck(type, envelope(type, payload, id)) as Promise<WsAck<T>>;
}

/** Resolves with the payload of the next enveloped `type` event (optionally matching `pred`). */
export function next<T = any>(s: Socket, type: string, pred: (p: T) => boolean = () => true, timeoutMs = 10_000): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			s.off(type, handler);
			reject(new Error(`timeout waiting for ${type}`));
		}, timeoutMs);
		const handler = (env: { payload: T }): void => {
			if (!pred(env.payload)) return;
			clearTimeout(timer);
			s.off(type, handler);
			resolve(env.payload);
		};
		s.on(type, handler);
	});
}

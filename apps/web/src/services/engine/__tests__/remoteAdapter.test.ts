// @vitest-environment node
/**
 * RemoteEngineAdapter against a REAL socket.io server (from apps/server's deps)
 * that mimics the `/engine` gateway protocol: enveloped commands, WsAck acks,
 * enveloped engine:info / engine:bestmove events.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { engineMeta, envelope, EngineEvents, INITIAL_FEN, type EngineInfo, type WsEnvelope } from '@chess/core';
import { RemoteEngineAdapter } from '../adapters/RemoteEngineAdapter';
import { isAbortError } from '../types';
import { nodeHttp, nodeModule } from './nodeApi';

/** Minimal socket.io server typings (the web app does not depend on socket.io). */
type Ack = (a: unknown) => void;
interface IoSocket {
	handshake: { auth?: { token?: string } };
	conn: { close(): void };
	on(ev: string, fn: (...args: any[]) => void): void;
	emit(ev: string, payload: unknown): void;
}
interface IoServer {
	of(ns: string): { use(fn: (s: IoSocket, next: (err?: Error) => void) => void): void; on(ev: 'connection', fn: (s: IoSocket) => void): void };
	close(): Promise<void>;
}

const require = (await nodeModule()).createRequire(new URL('../../../../../server/package.json', import.meta.url));
const { Server } = require('socket.io') as { Server: new (http: unknown, opts: object) => IoServer };

const http = (await nodeHttp()).createServer();
const io = new Server(http, { cors: { origin: '*' } });
let url = '';
const received: string[] = [];
let sessions = 0;
const sockets = new Set<IoSocket>();

beforeAll(async () => {
	const ns = io.of('/engine');
	ns.use((socket, next) => (socket.handshake.auth?.token === 'good' ? next() : next(new Error('unauthorized'))));
	ns.on('connection', (socket) => {
		sockets.add(socket);
		socket.on('disconnect', () => sockets.delete(socket));
		let sid = '';
		let searching: ReturnType<typeof setInterval> | null = null;
		const finish = (uci: string): void => {
			if (searching) clearInterval(searching);
			searching = null;
			socket.emit(EngineEvents.bestmove, envelope(EngineEvents.bestmove, { engineSessionId: sid, uci }));
		};
		socket.on(EngineEvents.start, (msg: WsEnvelope<{ engineId: string }>, ack: Ack) => {
			received.push(`start ${msg.payload.engineId}`);
			sid = `s${++sessions}`;
			ack({ ok: true, data: { engineSessionId: sid, meta: engineMeta('sf-native') } });
		});
		socket.on(EngineEvents.position, (msg: WsEnvelope<{ fen: string; moves: string[] }>, ack: Ack) => {
			received.push(`position ${msg.payload.moves.join(',')}`);
			ack(msg.v === 1 ? { ok: true, data: null } : { ok: false, error: { code: 'BAD_ENVELOPE', message: 'bad' } });
		});
		socket.on(EngineEvents.go, (msg: WsEnvelope<{ mode: string; play?: { targetElo?: number } }>, ack: Ack) => {
			received.push(`go ${msg.payload.mode} ${msg.payload.play?.targetElo ?? ''}`.trim());
			ack({ ok: true, data: null });
			if (msg.payload.mode === 'play') {
				if (msg.payload.play?.targetElo === 9999) return; // never answers (used for the disconnect test)
				setTimeout(() => finish('e2e4'), 10);
			} else {
				let d = 0;
				searching = setInterval(() => {
					d++;
					const info: EngineInfo = { depth: d, multipv: 1, score: { cp: 20 }, pv: ['e2e4'] };
					socket.emit(EngineEvents.info, envelope(EngineEvents.info, { engineSessionId: sid, info }));
					socket.emit(EngineEvents.info, envelope(EngineEvents.info, { engineSessionId: 'other', info: { ...info, score: { cp: -999 } } }));
				}, 5);
			}
		});
		socket.on(EngineEvents.stop, (_msg: unknown, ack: Ack) => {
			received.push('stop');
			ack({ ok: true, data: null });
			if (searching) setTimeout(() => finish('d2d4'), 5);
		});
	});
	await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
	url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
});

afterAll(async () => {
	await io.close();
});

const meta = engineMeta('sf-native')!;
const start = { fen: INITIAL_FEN, moves: [] as string[] };

describe('RemoteEngineAdapter (real socket.io)', () => {
	it('rejects init with a bad token', async () => {
		const a = new RemoteEngineAdapter(meta, { serverUrl: url, token: 'bad' });
		await expect(a.init()).rejects.toThrow(/unreachable: unauthorized/);
		expect(a.status).toBe('error');
		a.dispose();
	});

	it('init → engine:start; play → position + go(play) → bestmove', async () => {
		const a = new RemoteEngineAdapter(meta, { serverUrl: `${url}/`, token: () => 'good' });
		await a.init();
		expect(a.status).toBe('ready');
		expect(received).toContain('start sf-native');
		const res = await a.play({ fen: INITIAL_FEN, moves: ['e2e4', 'e7e5'] }, { targetElo: 1500, think: { preset: 'fast' } });
		expect(res.uci).toBe('e2e4');
		expect(received).toContain('position e2e4,e7e5');
		expect(received).toContain('go play 1500');
		a.dispose();
	});

	it('streams analysis infos for its own session only; stop drains bestmove before the next play', async () => {
		const a = new RemoteEngineAdapter(meta, { serverUrl: url, token: 'good' });
		const infos: EngineInfo[] = [];
		const stop = a.analyze(start, { multiPv: 1, infinite: true }, (i) => infos.push(i));
		while (infos.length < 3) await new Promise((r) => setTimeout(r, 5));
		expect(infos.every((i) => i.score.cp === 20)).toBe(true);
		stop();
		const res = await a.play(start, { think: { preset: 'instant' } });
		expect(res.uci).toBe('e2e4');
		const iStop = received.lastIndexOf('stop');
		expect(received.lastIndexOf('go play')).toBeGreaterThan(iStop);
		a.dispose();
	});

	it('a dropped connection rejects in-flight play; the next call reconnects with a new session', async () => {
		const a = new RemoteEngineAdapter(meta, { serverUrl: url, token: 'good' });
		await a.init();
		const before = sessions;
		const p = a.play(start, { targetElo: 9999, think: { preset: 'fast' } });
		while (!received.includes('go play 9999')) await new Promise((r) => setTimeout(r, 5));
		for (const s of sockets) s.conn.close(); // transport drop → client auto-reconnects
		await expect(p).rejects.toThrow(/disconnected/);
		// Wait for socket.io's automatic reconnect.
		const end = Date.now() + 5000;
		let res: { uci: string } | null = null;
		while (!res && Date.now() < end) {
			res = await a.play(start, { think: { preset: 'instant' } }).catch(() => null);
			if (!res) await new Promise((r) => setTimeout(r, 100));
		}
		expect(res?.uci).toBe('e2e4');
		expect(sessions).toBeGreaterThan(before);
		a.dispose();
	});

	it('stop() aborts an in-flight play', async () => {
		const a = new RemoteEngineAdapter(meta, { serverUrl: url, token: 'good', drainTimeoutMs: 100 });
		await a.init();
		const p = a.play(start, { targetElo: 9999, think: { preset: 'fast' } });
		await new Promise((r) => setTimeout(r, 30));
		a.stop();
		await expect(p).rejects.toSatisfy(isAbortError);
		a.dispose();
	});
});

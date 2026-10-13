import { resolve } from 'path';
import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { EngineEvents, type EngineInfoPayload, type EngineStartResult, type RemoteEngineDto } from '@chess/core';
import { EnginesService } from '../../src/modules/engines/engines.service';
import { bootApp, connect, connectExpectingRejection, guestToken, next, ownerToken, send, TestApp } from '../helpers/app';

const FAKE = resolve(__dirname, '../fixtures/fake-uci.js');

describe('/engine gateway (fake UCI engine)', () => {
	let t: TestApp;
	let token: string;
	const sockets: Socket[] = [];

	beforeAll(async () => {
		t = await bootApp({ ENGINE_STOCKFISH_PATH: FAKE, ENGINE_KOMODO_PATH: '/nope/komodo', ENGINE_MAX_PER_SOCKET: '1' });
		token = await ownerToken(t.app);
	});
	afterEach(() => sockets.splice(0).forEach((s) => s.disconnect()));
	afterAll(() => t.close());

	it('GET /engines reports availability with reasons', async () => {
		const res = await request(t.app.getHttpServer()).get('/engines');
		const list = res.body.data as RemoteEngineDto[];
		expect(list.find((e) => e.id === 'sf-native')).toMatchObject({ available: true, kind: 'remote' });
		expect(list.find((e) => e.id === 'komodo')).toMatchObject({ available: false, reason: expect.stringContaining('/nope/komodo') });
		expect(list.find((e) => e.id === 'lc0')).toMatchObject({ available: false, reason: 'ENGINE_LC0_PATH not set' });
		const health = await request(t.app.getHttpServer()).get('/health');
		expect(health.body.data.features.engines).toBe(true);
	});

	it('rejects guests and unauthenticated sockets', async () => {
		const g = await guestToken(t.app, 'G');
		const guest = await connectExpectingRejection(t.url, '/engine', EngineEvents.error, g.token);
		expect(guest).toMatchObject({ disconnected: true, payload: { message: expect.stringMatching(/guests/) } });
		const anon = await connectExpectingRejection(t.url, '/engine', EngineEvents.error);
		expect(anon).toMatchObject({ disconnected: true, payload: { message: 'missing token' } });
	});

	it('start → position → analyze streams info, stop yields bestmove; play returns a move', async () => {
		const s = await connect(t.url, '/engine', token);
		sockets.push(s);
		const started = await send<EngineStartResult>(s, EngineEvents.start, { engineId: 'sf-native' });
		expect(started.ok).toBe(true);
		const id = started.data!.engineSessionId;
		expect(started.data!.meta.id).toBe('sf-native');

		// Per-socket quota (ENGINE_MAX_PER_SOCKET=1)
		const second = await send(s, EngineEvents.start, { engineId: 'sf-native' });
		expect(second).toMatchObject({ ok: false, error: { code: 'QUOTA' } });

		expect((await send(s, EngineEvents.position, { engineSessionId: id, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: [] })).ok).toBe(true);

		const infos: EngineInfoPayload[] = [];
		s.on(EngineEvents.info, (env: { payload: EngineInfoPayload }) => infos.push(env.payload));
		const goAck = await send(s, EngineEvents.go, { engineSessionId: id, mode: 'analyze', analyze: { multiPv: 2, infinite: true } });
		expect(goAck.ok).toBe(true);
		await new Promise((r) => setTimeout(r, 150));
		const best = next(s, EngineEvents.bestmove);
		expect((await send(s, EngineEvents.stop, { engineSessionId: id })).ok).toBe(true);
		expect(await best).toMatchObject({ engineSessionId: id, uci: 'e2e4' });
		expect(infos.length).toBeGreaterThan(1);
		expect(new Set(infos.map((i) => i.info.multipv))).toEqual(new Set([1, 2]));

		await send(s, EngineEvents.position, { engineSessionId: id, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: ['e2e4'] });
		const played = next(s, EngineEvents.bestmove);
		const t0 = Date.now();
		await send(s, EngineEvents.go, { engineSessionId: id, mode: 'play', play: { targetElo: 1500, think: { preset: 'instant' } } });
		expect(await played).toMatchObject({ engineSessionId: id, uci: 'e7e5' });
		expect(Date.now() - t0).toBeGreaterThanOrEqual(350); // min human delay

		expect((await send(s, EngineEvents.close, { engineSessionId: id })).ok).toBe(true);
		expect((await send(s, EngineEvents.stop, { engineSessionId: id })).error?.code).toBe('NOT_FOUND');
	});

	it('kills engine processes when the socket disconnects', async () => {
		const pool = t.app.get(EnginesService).pool;
		const s = await connect(t.url, '/engine', token);
		await send(s, EngineEvents.start, { engineId: 'sf-native' });
		const before = pool.size;
		expect(before).toBeGreaterThan(0);
		s.disconnect();
		await new Promise((r) => setTimeout(r, 200));
		expect(pool.size).toBeLessThan(before);
	});

	it('rejects bad envelopes and unknown engines', async () => {
		const s = await connect(t.url, '/engine', token);
		sockets.push(s);
		const bad = (await s.timeout(5000).emitWithAck(EngineEvents.start, { engineId: 'sf-native' })) as { ok: boolean; error: { code: string } };
		expect(bad).toMatchObject({ ok: false, error: { code: 'BAD_ENVELOPE' } });
		expect((await send(s, EngineEvents.start, { engineId: 'komodo' })).error?.code).toBe('UNAVAILABLE');
		expect((await send(s, EngineEvents.start, { engineId: 'nope' })).error?.code).toBe('NOT_FOUND');
	});
});

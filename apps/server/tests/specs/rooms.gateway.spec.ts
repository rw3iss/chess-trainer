import type { Socket } from 'socket.io-client';
import { RoomEvents, type ChatMessage, type GameMovedPayload, type RoomJoinResult, type RoomState } from '@chess/core';
import { bootApp, connect, connectExpectingRejection, guestToken, next, send, TestApp } from '../helpers/app';

describe('/play gateway (rooms)', () => {
	let t: TestApp;
	let alice: Socket;
	let bob: Socket;
	let aliceId: string;

	beforeAll(async () => {
		t = await bootApp();
		const a = await guestToken(t.app, 'Alice');
		const b = await guestToken(t.app, 'Bob');
		aliceId = a.id;
		alice = await connect(t.url, '/play', a.token);
		bob = await connect(t.url, '/play', b.token);
	});
	afterAll(async () => {
		alice.disconnect();
		bob.disconnect();
		await t.close();
	});

	async function newRoom(clock?: { initialMs: number; incrementMs: number }): Promise<string> {
		const created = await send<RoomJoinResult>(alice, RoomEvents.create, { name: 'test', color: 'white', clock });
		expect(created.ok).toBe(true);
		expect(created.data!.seat).toBe('white');
		const roomId = created.data!.room.id;
		const joined = await send<RoomJoinResult>(bob, RoomEvents.join, { roomId });
		expect(joined.data!.seat).toBe('black');
		return roomId;
	}

	it('rejects connections without a token', async () => {
		const res = await connectExpectingRejection(t.url, '/play', 'error');
		expect(res).toMatchObject({ disconnected: true, payload: { code: 'UNAUTHORIZED' } });
	});

	it('create, join, move broadcast, illegal + out-of-turn rejected, idempotent retries', async () => {
		const roomId = await newRoom();
		const bobSees = next<GameMovedPayload>(bob, RoomEvents.moved);
		const mv = await send<GameMovedPayload>(alice, RoomEvents.move, { roomId, uci: 'e2e4' }, 'move-1');
		expect(mv).toMatchObject({ ok: true, data: { uci: 'e2e4', san: 'e4', ply: 1 } });
		expect(await bobSees).toMatchObject({ roomId, uci: 'e2e4', san: 'e4' });

		// Retried envelope id → same result, not applied twice
		const retry = await send<GameMovedPayload>(alice, RoomEvents.move, { roomId, uci: 'e2e4' }, 'move-1');
		expect(retry.data).toEqual(mv.data);

		expect((await send(alice, RoomEvents.move, { roomId, uci: 'd2d4' })).error?.code).toBe('NOT_YOUR_TURN');
		expect((await send(bob, RoomEvents.move, { roomId, uci: 'e7e6e' })).error?.code).toBe('ILLEGAL_MOVE');
		expect((await send(bob, RoomEvents.move, { roomId, uci: 'e2e4' })).error?.code).toBe('ILLEGAL_MOVE');
		expect((await send(bob, RoomEvents.move, { roomId, uci: 'e7e5' })).ok).toBe(true);

		const state = await send<RoomState>(bob, RoomEvents.resync, { roomId });
		expect(state.data!.moves).toEqual(['e2e4', 'e7e5']);
	});

	it('chat and generic actions are broadcast', async () => {
		const roomId = await newRoom();
		const got = next<ChatMessage>(bob, RoomEvents.chat);
		const ack = await send<ChatMessage>(alice, RoomEvents.chat, { roomId, text: '  hello  ' });
		expect(ack.data!.text).toBe('hello');
		expect(await got).toMatchObject({ roomId, text: 'hello', from: { displayName: 'Alice' } });

		const action = next<{ type: string; payload: unknown; from: string }>(bob, RoomEvents.action);
		await send(alice, RoomEvents.action, { roomId, type: 'arrow', payload: { from: 'e2', to: 'e4' } });
		expect(await action).toMatchObject({ type: 'arrow', payload: { from: 'e2', to: 'e4' }, from: aliceId });
	});

	it('resign and draw offer/answer end the game', async () => {
		const r1 = await newRoom();
		const ended = next<{ result: { winner: string; reason: string } }>(alice, RoomEvents.ended);
		await send(bob, RoomEvents.resign, { roomId: r1 });
		expect((await ended).result).toEqual({ winner: 'white', reason: 'resign' });
		expect((await send(alice, RoomEvents.move, { roomId: r1, uci: 'e2e4' })).error?.code).toBe('GAME_OVER');

		const r2 = await newRoom();
		expect((await send(alice, RoomEvents.drawAnswer, { roomId: r2, accept: true })).error?.code).toBe('NO_OFFER');
		await send(alice, RoomEvents.drawOffer, { roomId: r2 });
		const drawn = next<{ result: { winner: null; reason: string } }>(alice, RoomEvents.ended);
		await send(bob, RoomEvents.drawAnswer, { roomId: r2, accept: true });
		expect((await drawn).result).toEqual({ winner: null, reason: 'draw-agreed' });
	});

	it('server clock flags the side to move', async () => {
		const roomId = await newRoom({ initialMs: 1000, incrementMs: 0 });
		// White's first move starts Black's clock; Black never moves.
		const mv = await send<GameMovedPayload>(alice, RoomEvents.move, { roomId, uci: 'e2e4' });
		expect(mv.data!.clock).toMatchObject({ running: 'black' });
		const ended = await next<{ result: { winner: string; reason: string }; room: RoomState }>(bob, RoomEvents.ended, () => true, 5000);
		expect(ended.result).toEqual({ winner: 'white', reason: 'timeout' });
		expect(ended.room.clock!.remaining.black).toBe(0);
	});

	it('presence: disconnect keeps the seat and reconnect by userId restores it', async () => {
		const c = await guestToken(t.app, 'Carol');
		const carol = await connect(t.url, '/play', c.token);
		const created = await send<RoomJoinResult>(carol, RoomEvents.create, { color: 'black' });
		const roomId = created.data!.room.id;
		await send(alice, RoomEvents.join, { roomId });
		const offline = next<{ players: RoomState['players'] }>(alice, RoomEvents.presence, (p) => p.players.black?.connected === false);
		carol.disconnect();
		expect((await offline).players.black).toMatchObject({ displayName: 'Carol', connected: false });

		const carol2 = await connect(t.url, '/play', c.token);
		const back = await send<RoomJoinResult>(carol2, RoomEvents.join, { roomId });
		expect(back.data!.seat).toBe('black');
		expect(back.data!.room.players.black!.connected).toBe(true);
		carol2.disconnect();
	});

	it('third user joins as spectator and cannot move', async () => {
		const roomId = await newRoom();
		const d = await guestToken(t.app, 'Dan');
		const dan = await connect(t.url, '/play', d.token);
		const joined = await send<RoomJoinResult>(dan, RoomEvents.join, { roomId });
		expect(joined.data!.seat).toBe('spectator');
		expect((await send(dan, RoomEvents.move, { roomId, uci: 'e2e4' })).error?.code).toBe('NOT_A_PLAYER');
		expect((await send(dan, RoomEvents.join, { roomId: 'missing' })).error?.code).toBe('NOT_FOUND');
		dan.disconnect();
	});
});

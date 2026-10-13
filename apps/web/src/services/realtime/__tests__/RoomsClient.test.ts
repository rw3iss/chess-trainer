import { afterEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_FEN } from '@chess/core/chess';
import { RoomEvents, type RoomState } from '@chess/core/protocol';
import { RoomError, RoomsClient, type RoomEvent } from '../RoomsClient';
import { FakeSocket } from './fakeSocket';

function room(id = 'r1', patch: Partial<RoomState> = {}): RoomState {
	return {
		id,
		name: 'Test room',
		createdAt: 0,
		players: { white: { userId: 'u1', displayName: 'Ann', connected: true } },
		spectators: [],
		startFen: INITIAL_FEN,
		moves: [],
		fen: INITIAL_FEN,
		chat: [],
		...patch,
	};
}

function setup(opts: { url?: string | null } = {}) {
	let socket!: FakeSocket;
	const factory = vi.fn((_url: string, o: { auth: (cb: (d: { token: string }) => void) => void }) => {
		socket = new FakeSocket(o.auth);
		return socket;
	});
	const client = new RoomsClient({
		url: () => (opts.url === undefined ? 'http://srv' : opts.url),
		getToken: async () => 'tok-1',
		socketFactory: factory,
		ackTimeoutMs: 50,
	});
	return { client, factory, socket: () => socket };
}

describe('RoomsClient', () => {
	afterEach(() => vi.useRealTimers());

	it('connects lazily with the auth token and sends versioned envelopes with acks', async () => {
		const { client, factory, socket } = setup();
		expect(client.status.value).toBe('idle');
		const p = client.create({ color: 'white' });
		await vi.waitFor(() => expect(socket()).toBeDefined());
		socket().server.set(RoomEvents.create, () => ({ room: room(), seat: 'white' }));
		const res = await p;
		expect(factory).toHaveBeenCalledWith('http://srv', expect.anything());
		expect(socket().authToken).toBe('tok-1');
		expect(res.seat).toBe('white');
		expect(client.status.value).toBe('connected');
		const env = socket().sent[0]!;
		expect(env).toMatchObject({ v: 1, type: RoomEvents.create, payload: { color: 'white' } });
		expect(typeof env.id).toBe('string');
	});

	it('maps a failed ack to RoomError with the server code', async () => {
		const { client, socket } = setup();
		const p = client.join('nope');
		await vi.waitFor(() => expect(socket()).toBeDefined());
		socket().server.set(RoomEvents.join, () => {
			throw { code: 'NOT_FOUND', message: 'room not found' };
		});
		await expect(p).rejects.toMatchObject({ name: 'RoomError', code: 'NOT_FOUND' });
	});

	it('times out when the server never acks', async () => {
		const { client, socket } = setup();
		const first = client.join('r1');
		await vi.waitFor(() => expect(socket()).toBeDefined());
		socket().server.set(RoomEvents.join, () => ({ room: room(), seat: 'white' }));
		await first;
		socket().answer = false;
		await expect(client.resync('r1')).rejects.toBeInstanceOf(RoomError);
	});

	it('uses the given envelope id for moves (idempotency key)', async () => {
		const { client, socket } = setup();
		const p = client.join('r1');
		await vi.waitFor(() => expect(socket()).toBeDefined());
		socket().server.set(RoomEvents.join, () => ({ room: room(), seat: 'white' }));
		await p;
		socket().server.set(RoomEvents.move, (env) => ({ roomId: 'r1', uci: (env.payload as { uci: string }).uci, san: 'e4', fen: 'x', ply: 1 }));
		await client.move('r1', 'e2e4', 'move-123');
		const sent = socket().sent.find((e) => e.type === RoomEvents.move)!;
		expect(sent.id).toBe('move-123');
		expect(sent.payload).toEqual({ roomId: 'r1', uci: 'e2e4' });
	});

	it('fans out server broadcasts and ignores wrong protocol versions', async () => {
		const { client, socket } = setup();
		const events: RoomEvent[] = [];
		client.onEvent((e) => events.push(e));
		const p = client.join('r1');
		await vi.waitFor(() => expect(socket()).toBeDefined());
		socket().server.set(RoomEvents.join, () => ({ room: room(), seat: 'white' }));
		await p;
		socket().push(RoomEvents.moved, { roomId: 'r1', uci: 'e2e4', san: 'e4', fen: 'f', ply: 1 });
		socket().push(RoomEvents.chat, { id: 'c1', roomId: 'r1', from: { userId: 'u1', displayName: 'Ann', connected: true }, text: 'hi', at: 1 });
		(socket() as unknown as { fire: (e: string, a: unknown) => void }).fire(RoomEvents.state, { v: 2, type: 'room:state', id: 'x', payload: room() });
		expect(events.map((e) => e.type)).toEqual(['moved', 'chat']);
	});

	it('re-joins rooms after a reconnect and emits resync with the fresh state', async () => {
		const { client, socket } = setup();
		const events: RoomEvent[] = [];
		client.onEvent((e) => events.push(e));
		const p = client.join('r1');
		await vi.waitFor(() => expect(socket()).toBeDefined());
		let joins = 0;
		socket().server.set(RoomEvents.join, () => ({ room: room('r1', { moves: joins++ ? ['e2e4'] : [] }), seat: 'white' }));
		await p;
		await socket().dropAndReconnect();
		await vi.waitFor(() => expect(events.some((e) => e.type === 'resync')).toBe(true));
		const resync = events.find((e) => e.type === 'resync') as Extract<RoomEvent, { type: 'resync' }>;
		expect(resync.room.moves).toEqual(['e2e4']);
		expect(client.status.value).toBe('connected');
	});

	it('rejects without a configured server', async () => {
		const { client } = setup({ url: null });
		await expect(client.join('r1')).rejects.toMatchObject({ code: 'UNCONFIGURED' });
	});

	it('surfaces handshake errors as auth-error events', async () => {
		const { client, socket } = setup();
		const events: RoomEvent[] = [];
		client.onEvent((e) => events.push(e));
		const p = client.join('r1');
		await vi.waitFor(() => expect(socket()).toBeDefined());
		socket().server.set(RoomEvents.join, () => ({ room: room(), seat: 'white' }));
		await p;
		(socket() as unknown as { fire: (e: string, a: unknown) => void }).fire('error', { code: 'UNAUTHORIZED', message: 'bad token' });
		expect(events.at(-1)).toEqual({ type: 'auth-error', code: 'UNAUTHORIZED', message: 'bad token' });
		expect(client.status.value).toBe('error');
	});
});

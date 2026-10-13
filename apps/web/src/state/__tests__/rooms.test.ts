import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_FEN, applyUci } from '@chess/core/chess';
import { mainline } from '@chess/core/chess';
import { RoomEvents, type RoomState } from '@chess/core/protocol';
import { RoomsClient } from '@/services/realtime';
import { FakeSocket } from '@/services/realtime/__tests__/fakeSocket';
import { activeSession, getSession, resetSessionsState } from '@/state/sessions';
import { currentRoom, isMyTurn, mySeat, pendingMove, roomError, roomSessionId, roomsActions, resetRoomsState, setRoomsClient } from '@/state/rooms';
import { freshRepositories } from './testDb';

const ANN = { userId: 'u1', displayName: 'Ann', connected: true };
const BOB = { userId: 'u2', displayName: 'Bob', connected: true };

function baseRoom(patch: Partial<RoomState> = {}): RoomState {
	return { id: 'r1', name: 'Friendly', createdAt: 0, players: { white: ANN }, spectators: [], startFen: INITIAL_FEN, moves: [], fen: INITIAL_FEN, chat: [], ...patch };
}

/** Tiny authoritative server: validates turn + legality, broadcasts game:moved. */
function setup() {
	let socket!: FakeSocket;
	const state = { room: baseRoom() };
	const client = new RoomsClient({
		url: () => 'http://srv',
		getToken: async () => 't',
		socketFactory: (_u, o) => {
			socket = new FakeSocket(o.auth);
			socket.server.set(RoomEvents.create, () => ({ room: state.room, seat: 'white' }));
			socket.server.set(RoomEvents.join, () => ({ room: state.room, seat: 'white' }));
			socket.server.set(RoomEvents.resync, () => state.room);
			socket.server.set(RoomEvents.move, (env) => {
				const { uci } = env.payload as { uci: string };
				const r = state.room;
				if (!r.players.black) throw { code: 'WAITING', message: 'waiting' };
				const res = applyUci(r.fen, uci);
				if (!res) throw { code: 'ILLEGAL_MOVE', message: 'illegal' };
				state.room = { ...r, moves: [...r.moves, res.uci], fen: res.fen };
				return { roomId: r.id, uci: res.uci, san: res.san, fen: res.fen, ply: state.room.moves.length };
			});
			socket.server.set(RoomEvents.chat, (env) => ({ id: `m${Math.random()}`, roomId: 'r1', from: ANN, text: (env.payload as { text: string }).text, at: 1 }));
			return socket;
		},
		ackTimeoutMs: 100,
	});
	setRoomsClient(client);
	return { state, socket: () => socket };
}

function sessionUcis(): string[] {
	const s = getSession(roomSessionId.value)!;
	return mainline(s.tree).map((n) => n.uci);
}

describe('rooms store', () => {
	beforeEach(() => {
		freshRepositories();
		resetSessionsState();
	});
	afterEach(() => resetRoomsState());

	it('create → opens an active online session oriented to my seat', async () => {
		setup();
		const room = await roomsActions.create({ color: 'white' });
		expect(room.id).toBe('r1');
		expect(mySeat.value).toBe('white');
		const s = activeSession.value!;
		expect(s.id).toBe(roomSessionId.value);
		expect(s.mode).toBe('online');
		expect(s.source).toMatchObject({ kind: 'online', roomId: 'r1' });
		expect(s.title).toBe('Friendly');
	});

	it('a local move is only committed once the server accepts it', async () => {
		const { state } = setup();
		await roomsActions.create({ color: 'white' });
		// No opponent yet → rejected, nothing committed.
		expect(await roomsActions.move('e2e4')).toBe(false);
		expect(roomError.value).toMatch(/opponent/i);
		expect(sessionUcis()).toEqual([]);

		state.room = { ...state.room, players: { white: ANN, black: BOB } };
		const p = roomsActions.move('e2e4');
		expect(pendingMove.value).toBe('e2e4');
		expect(sessionUcis()).toEqual([]);
		expect(await p).toBe(true);
		expect(pendingMove.value).toBeNull();
		expect(sessionUcis()).toEqual(['e2e4']);
		expect(isMyTurn.value).toBe(false);
	});

	it('applies opponent moves from broadcasts and ignores the echo of my own', async () => {
		const { state, socket } = setup();
		state.room = { ...state.room, players: { white: ANN, black: BOB } };
		await roomsActions.create({ color: 'white' });
		await roomsActions.move('e2e4');
		// Echo of my own move (same ply) → ignored.
		socket().push(RoomEvents.moved, { roomId: 'r1', uci: 'e2e4', san: 'e4', fen: state.room.fen, ply: 1 });
		expect(sessionUcis()).toEqual(['e2e4']);
		const res = applyUci(state.room.fen, 'e7e5')!;
		socket().push(RoomEvents.moved, { roomId: 'r1', uci: 'e7e5', san: res.san, fen: res.fen, ply: 2 });
		expect(sessionUcis()).toEqual(['e2e4', 'e7e5']);
		expect(currentRoom.value!.moves).toEqual(['e2e4', 'e7e5']);
		expect(isMyTurn.value).toBe(true);
	});

	it('resyncs when a move broadcast skips a ply', async () => {
		const { state, socket } = setup();
		state.room = { ...state.room, players: { white: ANN, black: BOB } };
		await roomsActions.create({ color: 'white' });
		// Server moved on by two plies while we missed one event.
		state.room = { ...state.room, moves: ['e2e4', 'e7e5', 'g1f3'], fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2' };
		socket().push(RoomEvents.moved, { roomId: 'r1', uci: 'g1f3', san: 'Nf3', fen: state.room.fen, ply: 3 });
		await vi.waitFor(() => expect(sessionUcis()).toEqual(['e2e4', 'e7e5', 'g1f3']));
	});

	it('chat, presence and game end update the room', async () => {
		const { state, socket } = setup();
		await roomsActions.create({ color: 'white' });
		await roomsActions.chat('hello');
		expect(currentRoom.value!.chat.map((m) => m.text)).toEqual(['hello']);
		socket().push(RoomEvents.presence, { roomId: 'r1', players: { white: ANN, black: BOB }, spectators: [] });
		expect(currentRoom.value!.players.black?.displayName).toBe('Bob');
		const ended = { ...state.room, players: { white: ANN, black: BOB }, result: { winner: 'black' as const, reason: 'resign' as const } };
		socket().push(RoomEvents.ended, { roomId: 'r1', result: ended.result, room: ended });
		expect(currentRoom.value!.result).toEqual({ winner: 'black', reason: 'resign' });
		expect(getSession(roomSessionId.value)!.result).toEqual({ winner: 'black', reason: 'resign' });
		expect(isMyTurn.value).toBe(false);
	});

	it('leave clears the room but keeps the session', async () => {
		setup();
		await roomsActions.create({ color: 'white' });
		const sid = roomSessionId.value!;
		await roomsActions.leave();
		expect(currentRoom.value).toBeNull();
		expect(getSession(sid)).not.toBeNull();
	});
});

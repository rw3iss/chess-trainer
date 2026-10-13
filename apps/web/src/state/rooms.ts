// Rooms store — online play over the server's '/play' namespace (PLAN phase 13).
//
// Read:   currentRoom, mySeat, roomSessionId, roomConnection, roomError, pendingMove,
//         roomsAvailable, roomsUnavailableReason, isMyTurn
// Write:  roomsActions.create / join / leave / move / resign / offerDraw / answerDraw / chat
//
// Each room maps to one local Session (mode 'online', source { kind: 'online', roomId }).
// The server is authoritative: a local move is sent as game:move and only lands in the
// session when the ack / game:moved broadcast arrives. Clocks come from the server's
// ClockState (translated to local time by an estimated skew).
import { batch, computed, signal } from '@preact/signals';
import { turnFromFen, type Color, type Uci } from '@chess/core/chess';
import type { ClockConfig } from '@chess/core/clock';
import { createSession, type Session } from '@chess/core/game';
import type { ChatMessage, GameMovedPayload, RoomState } from '@chess/core/protocol';
import { RoomError, RoomsClient, roomSessionPatch, seatColor, type RoomEvent, type Seat } from '@/services/realtime';
import { serverConnector } from '@/services/server';
import { authActions } from './auth';
import { defineStore } from './registry';
import { getSession, openSessions, sessionsActions } from './sessions';

export interface CreateRoomOptions {
	name?: string;
	color: Color | 'random';
	/** Omit for an untimed game. */
	clock?: ClockConfig;
}

// ── Client ────────────────────────────────────────────────────────────────
let client: RoomsClient = new RoomsClient({
	url: () => serverConnector.url.value,
	getToken: async () => (await authActions.roomToken()).token,
});
let unsubscribe: (() => void) | null = null;

/** Test hook: swap the client (e.g. one built on a fake socket). */
export function setRoomsClient(next: RoomsClient): void {
	unsubscribe?.();
	client = next;
	unsubscribe = client.onEvent(onRoomEvent);
	_clientVersion.value++;
}

export function roomsClient(): RoomsClient {
	return client;
}

// ── State ─────────────────────────────────────────────────────────────────
const _room = signal<RoomState | null>(null);
const _seat = signal<Seat | null>(null);
const _sessionId = signal<string | null>(null);
const _error = signal<string | null>(null);
const _pending = signal<Uci | null>(null);
const _joining = signal(false);
const _clientVersion = signal(0);
/** local − server clock offset, estimated from move broadcasts. */
let skewMs = 0;

export const currentRoom = computed(() => _room.value);
export const mySeat = computed(() => _seat.value);
export const myColor = computed(() => seatColor(_seat.value));
export const roomSessionId = computed(() => _sessionId.value);
export const roomError = computed(() => _error.value);
export const pendingMove = computed(() => _pending.value);
export const roomJoining = computed(() => _joining.value);
export const roomConnection = computed(() => {
	void _clientVersion.value;
	return client.status.value;
});
export const roomChat = computed<ChatMessage[]>(() => _room.value?.chat ?? []);

/** Online play needs a reachable server with the rooms feature. */
export const roomsAvailable = computed(() => serverConnector.status.value === 'online' && serverConnector.health.value?.features.rooms !== false);
export const roomsUnavailableReason = computed<string | null>(() => {
	const status = serverConnector.status.value;
	if (status === 'unconfigured') return 'No server is configured. Online play needs the optional game server — add its address in Settings → Server.';
	if (status === 'offline') return 'The game server is unreachable. Online play needs a connection to it; everything else keeps working offline.';
	if (serverConnector.health.value?.features.rooms === false) return 'This server has online rooms turned off.';
	return null;
});

export const isMyTurn = computed(() => {
	const room = _room.value;
	const color = seatColor(_seat.value);
	if (!room || !color || room.result) return false;
	return turnFromFen(room.fen) === color;
});

// ── Session mapping ───────────────────────────────────────────────────────
function findRoomSession(roomId: string): Session | null {
	return openSessions.value.find((s) => s.mode === 'online' && s.source.roomId === roomId) ?? null;
}

function ensureSession(room: RoomState, seat: Seat): Session {
	const orientation: Color = seat === 'black' ? 'black' : 'white';
	const existing = findRoomSession(room.id);
	if (existing) {
		sessionsActions.setActive(existing.id);
		if (existing.orientation !== orientation) sessionsActions.update({ orientation }, existing.id);
		return getSession(existing.id)!;
	}
	const created = createSession({ fen: room.startFen, mode: 'online', orientation, title: room.name, source: { kind: 'online', roomId: room.id } });
	return sessionsActions.open(created);
}

function applyRoom(room: RoomState): void {
	if (_room.value && _room.value.id !== room.id) return;
	_room.value = room;
	const s = getSession(_sessionId.value);
	if (!s) return;
	const patch = roomSessionPatch(s, room, skewMs);
	if (room.name && s.title !== room.name) patch.title = room.name;
	sessionsActions.update(patch, s.id);
}

function applyMoved(p: GameMovedPayload): void {
	const room = _room.value;
	if (!room || room.id !== p.roomId) return;
	if (p.ply <= room.moves.length) return; // duplicate (ack + broadcast)
	if (p.ply !== room.moves.length + 1) {
		// Missed a move — ask for the full state.
		void resync();
		return;
	}
	if (p.clock?.running && p.clock.lastStartedAt !== null) skewMs = Date.now() - p.clock.lastStartedAt;
	if (_pending.value === p.uci) _pending.value = null;
	applyRoom({ ...room, moves: [...room.moves, p.uci], fen: p.fen, clock: p.clock ?? room.clock, drawOfferFrom: undefined });
}

function onRoomEvent(e: RoomEvent): void {
	const room = _room.value;
	switch (e.type) {
		case 'state':
		case 'resync':
			if (room?.id === e.room.id) applyRoom(e.room);
			break;
		case 'moved':
			applyMoved(e.payload);
			break;
		case 'ended':
			if (room?.id === e.roomId) applyRoom(e.room);
			break;
		case 'chat':
			if (room?.id === e.message.roomId && !room.chat.some((m) => m.id === e.message.id)) {
				_room.value = { ...room, chat: [...room.chat, e.message] };
			}
			break;
		case 'presence':
			if (room?.id === e.roomId) _room.value = { ...room, players: e.players, spectators: e.spectators };
			break;
		case 'auth-error':
			_error.value = `Connection refused: ${e.message}`;
			break;
		case 'action':
			break;
	}
}

async function resync(): Promise<void> {
	const room = _room.value;
	if (!room) return;
	try {
		applyRoom(await client.resync(room.id));
	} catch (e) {
		_error.value = messageOf(e);
	}
}

function messageOf(e: unknown): string {
	if (e instanceof RoomError) {
		switch (e.code) {
			case 'NOT_FOUND':
				return 'This room does not exist (or the server restarted).';
			case 'NOT_YOUR_TURN':
				return 'It is not your turn.';
			case 'WAITING':
				return 'Waiting for an opponent to join.';
			case 'ILLEGAL_MOVE':
				return 'That move is not legal.';
			case 'GAME_OVER':
				return 'The game is over.';
			case 'FLAGGED':
				return 'Time is up.';
			default:
				return e.message;
		}
	}
	return e instanceof Error ? e.message : String(e);
}

function enter(room: RoomState, seat: Seat): void {
	const s = ensureSession(room, seat);
	batch(() => {
		_seat.value = seat;
		_sessionId.value = s.id;
		_error.value = null;
		_pending.value = null;
		_room.value = room;
	});
	applyRoom(room);
}

// ── Actions ───────────────────────────────────────────────────────────────
export const roomsActions = {
	async create(opts: CreateRoomOptions): Promise<RoomState> {
		_joining.value = true;
		_error.value = null;
		try {
			const res = await client.create({ name: opts.name?.trim() || undefined, color: opts.color, clock: opts.clock });
			enter(res.room, res.seat);
			return res.room;
		} catch (e) {
			_error.value = messageOf(e);
			throw e;
		} finally {
			_joining.value = false;
		}
	},

	async join(roomId: string): Promise<RoomState> {
		if (_room.value?.id === roomId && client.status.value === 'connected') return _room.value;
		_joining.value = true;
		_error.value = null;
		try {
			const res = await client.join(roomId);
			enter(res.room, res.seat);
			return res.room;
		} catch (e) {
			_error.value = messageOf(e);
			throw e;
		} finally {
			_joining.value = false;
		}
	},

	/** Leave the room (the seat is kept on the server for a later re-join). */
	async leave(): Promise<void> {
		const room = _room.value;
		batch(() => {
			_room.value = null;
			_seat.value = null;
			_sessionId.value = null;
			_pending.value = null;
			_error.value = null;
		});
		if (room) await client.leave(room.id);
	},

	/** Send a move; it lands in the session only once the server accepts it. */
	async move(uci: Uci): Promise<boolean> {
		const room = _room.value;
		if (!room || _pending.value) return false;
		_pending.value = uci;
		_error.value = null;
		try {
			const moved = await client.move(room.id, uci);
			applyMoved(moved);
			return true;
		} catch (e) {
			_error.value = messageOf(e);
			if (e instanceof RoomError && (e.code === 'TIMEOUT' || e.code === 'UNAVAILABLE')) void resync();
			return false;
		} finally {
			if (_pending.value === uci) _pending.value = null;
		}
	},

	async resign(): Promise<void> {
		const room = _room.value;
		if (!room) return;
		try {
			await client.resign(room.id);
			await resync();
		} catch (e) {
			_error.value = messageOf(e);
		}
	},

	async offerDraw(): Promise<void> {
		const room = _room.value;
		if (!room) return;
		try {
			applyRoom(await client.offerDraw(room.id));
		} catch (e) {
			_error.value = messageOf(e);
		}
	},

	async answerDraw(accept: boolean): Promise<void> {
		const room = _room.value;
		if (!room) return;
		try {
			applyRoom(await client.answerDraw(room.id, accept));
		} catch (e) {
			_error.value = messageOf(e);
		}
	},

	async chat(text: string): Promise<void> {
		const room = _room.value;
		const t = text.trim();
		if (!room || !t) return;
		try {
			const msg = await client.chat(room.id, t.slice(0, 500));
			onRoomEvent({ type: 'chat', message: msg });
		} catch (e) {
			_error.value = messageOf(e);
		}
	},

	resync,

	clearError(): void {
		_error.value = null;
	},
};

/** Test helper: clear in-memory state and drop the socket. */
export function resetRoomsState(): void {
	client.disconnect();
	skewMs = 0;
	batch(() => {
		_room.value = null;
		_seat.value = null;
		_sessionId.value = null;
		_error.value = null;
		_pending.value = null;
		_joining.value = false;
		_clientVersion.value++;
	});
}

unsubscribe = client.onEvent(onRoomEvent);

defineStore({
	name: 'rooms',
	dispose: () => client.disconnect(),
});

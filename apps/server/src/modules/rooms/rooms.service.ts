import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'crypto';
import {
	applyUci,
	checkFlag,
	createClock,
	detectResult,
	INITIAL_FEN,
	pressClock,
	remainingAt,
	turnFromFen,
	validateFen,
	type ChatMessage,
	type ClockConfig,
	type Color,
	type GameMovedPayload,
	type GameResult,
	type PlayerInfo,
	type RoomCreatePayload,
	type RoomJoinResult,
	type RoomState,
} from '@chess/core';
import type { AuthUser } from '../../common/auth/auth-user';
import { WsError } from '../../common/ws/ws.util';
import { CacheService } from '../../cache/cache.service';

const CHAT_KEEP = 100;
const CHAT_MAX_LEN = 500;
const MOVE_IDS_KEEP = 64;

/** Events the service pushes out; the gateway maps them to socket.io broadcasts. */
export interface RoomsEmitter {
	state(room: RoomState): void;
	moved(roomId: string, p: GameMovedPayload): void;
	ended(roomId: string, result: GameResult, room: RoomState): void;
	chat(roomId: string, msg: ChatMessage): void;
	presence(room: RoomState): void;
}

interface RoomRuntime {
	state: RoomState;
	/** Position history (FENs) for repetition detection. */
	fens: string[];
	/** Envelope id → result, so a retried move is answered, not re-applied. */
	moveIds: Map<string, GameMovedPayload>;
	/** userId → number of live sockets in the room. */
	connections: Map<string, number>;
	flagTimer?: NodeJS.Timeout;
}

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');

/**
 * Server-authoritative online rooms (namespace `/play`). State lives in
 * memory; when Redis is configured each change is mirrored to `room:<id>`
 * so a restarted server (or another instance) can rehydrate a room on join.
 */
@Injectable()
export class RoomsService implements OnModuleDestroy {
	private readonly logger = new Logger(RoomsService.name);
	private readonly rooms = new Map<string, RoomRuntime>();
	private emitter?: RoomsEmitter;
	private readonly ttl: number;

	constructor(
		private readonly cache: CacheService,
		config: ConfigService,
	) {
		this.ttl = config.get<number>('rooms.ttl') ?? 24 * 3600;
	}

	/** Time source (overridable in tests). */
	now: () => number = () => Date.now();

	bind(emitter: RoomsEmitter): void {
		this.emitter = emitter;
	}

	onModuleDestroy(): void {
		for (const r of this.rooms.values()) if (r.flagTimer) clearTimeout(r.flagTimer);
	}

	/** Creates a room and seats the creator. */
	create(user: AuthUser, p: RoomCreatePayload): RoomJoinResult {
		const startFen = p.startFen?.trim() || INITIAL_FEN;
		if (!validateFen(startFen)) throw new WsError('BAD_REQUEST', 'invalid startFen');
		if (p.clock) this.validateClock(p.clock);
		const color: Color = p.color === 'white' || p.color === 'black' ? p.color : Math.random() < 0.5 ? 'white' : 'black';
		const id = randomBytes(6).toString('base64url');
		const state: RoomState = {
			id,
			name: (p.name ?? '').trim().slice(0, 64) || `${user.displayName}'s game`,
			createdAt: this.now(),
			players: { [color]: this.player(user, true) },
			spectators: [],
			startFen,
			moves: [],
			fen: startFen,
			chat: [],
		};
		if (p.clock) state.clock = createClock(p.clock, turnFromFen(startFen));
		const rt: RoomRuntime = { state, fens: [startFen], moveIds: new Map(), connections: new Map([[user.id, 1]]) };
		this.rooms.set(id, rt);
		this.persist(rt);
		return { room: state, seat: color };
	}

	/**
	 * Joins (or re-joins) a room. A user who already holds a seat gets it back
	 * (reconnect by userId); otherwise the first free seat, else spectator.
	 */
	async join(user: AuthUser, roomId: string): Promise<RoomJoinResult> {
		const rt = await this.load(roomId);
		const s = rt.state;
		rt.connections.set(user.id, (rt.connections.get(user.id) ?? 0) + 1);
		let seat = this.seatOf(s, user.id);
		if (!seat) {
			const free = (['white', 'black'] as Color[]).find((c) => !s.players[c]);
			if (free && !s.result) {
				s.players[free] = this.player(user, true);
				seat = free;
			}
		}
		if (seat) s.players[seat] = { ...s.players[seat]!, connected: true };
		else if (!s.spectators.some((p) => p.userId === user.id)) s.spectators.push(this.player(user, true));
		else s.spectators = s.spectators.map((p) => (p.userId === user.id ? { ...p, connected: true } : p));
		this.persist(rt);
		this.emitter?.presence(s);
		return { room: s, seat: seat ?? 'spectator' };
	}

	/**
	 * A socket of `user` left the room (explicit leave or disconnect). Presence flips
	 * to disconnected only when the user's last socket is gone; seats are kept for reconnect.
	 */
	leave(user: AuthUser, roomId: string): void {
		const rt = this.rooms.get(roomId);
		if (!rt) return;
		const n = (rt.connections.get(user.id) ?? 1) - 1;
		if (n > 0) {
			rt.connections.set(user.id, n);
			return;
		}
		rt.connections.delete(user.id);
		const s = rt.state;
		const seat = this.seatOf(s, user.id);
		if (seat) s.players[seat] = { ...s.players[seat]!, connected: false };
		else s.spectators = s.spectators.filter((p) => p.userId !== user.id);
		this.persist(rt);
		this.emitter?.presence(s);
	}

	async resync(roomId: string): Promise<RoomState> {
		return (await this.load(roomId)).state;
	}

	/** Validates and applies a move. `moveId` (envelope id) makes retries idempotent. */
	move(user: AuthUser, roomId: string, uci: string, moveId: string): GameMovedPayload {
		const rt = this.get(roomId);
		const done = rt.moveIds.get(moveId);
		if (done) return done;
		const s = rt.state;
		if (s.result) throw new WsError('GAME_OVER', 'game is over');
		const seat = this.seatOf(s, user.id);
		if (!seat) throw new WsError('NOT_A_PLAYER', 'spectators cannot move');
		const turn = turnFromFen(s.fen);
		if (seat !== turn) throw new WsError('NOT_YOUR_TURN', 'not your turn');
		if (!s.players.white || !s.players.black) throw new WsError('WAITING', 'waiting for an opponent');

		const now = this.now();
		if (s.clock) {
			// Authoritative flag check before accepting the move.
			const checked = checkFlag(s.clock, now);
			if (checked.flagged) {
				s.clock = checked;
				this.end(rt, { winner: other(checked.flagged), reason: 'timeout' });
				throw new WsError('FLAGGED', 'time is up');
			}
		}
		const applied = applyUci(s.fen, String(uci));
		if (!applied) throw new WsError('ILLEGAL_MOVE', `illegal move ${uci}`);

		s.fen = applied.fen;
		s.moves = [...s.moves, applied.uci];
		s.drawOfferFrom = undefined;
		rt.fens.push(applied.fen);
		if (s.clock) s.clock = pressClock(s.clock, now);

		const payload: GameMovedPayload = { roomId, uci: applied.uci, san: applied.san, fen: applied.fen, ply: s.moves.length };
		if (s.clock) payload.clock = s.clock;
		rt.moveIds.set(moveId, payload);
		if (rt.moveIds.size > MOVE_IDS_KEEP) rt.moveIds.delete(rt.moveIds.keys().next().value!);

		this.emitter?.moved(roomId, payload);
		const result = detectResult(applied.fen, rt.fens);
		if (result) this.end(rt, result);
		else this.scheduleFlag(rt);
		this.persist(rt);
		return payload;
	}

	resign(user: AuthUser, roomId: string): GameResult {
		const rt = this.get(roomId);
		const seat = this.requirePlaying(rt, user);
		const result: GameResult = { winner: other(seat), reason: 'resign' };
		this.end(rt, result);
		return result;
	}

	offerDraw(user: AuthUser, roomId: string): RoomState {
		const rt = this.get(roomId);
		const seat = this.requirePlaying(rt, user);
		rt.state.drawOfferFrom = seat;
		this.persist(rt);
		this.emitter?.state(rt.state);
		return rt.state;
	}

	/** Answers the opponent's pending draw offer. */
	answerDraw(user: AuthUser, roomId: string, accept: boolean): RoomState {
		const rt = this.get(roomId);
		const seat = this.requirePlaying(rt, user);
		const from = rt.state.drawOfferFrom;
		if (!from || from === seat) throw new WsError('NO_OFFER', 'no draw offer to answer');
		rt.state.drawOfferFrom = undefined;
		if (accept) this.end(rt, { winner: null, reason: 'draw-agreed' });
		else {
			this.persist(rt);
			this.emitter?.state(rt.state);
		}
		return rt.state;
	}

	chat(user: AuthUser, roomId: string, text: string): ChatMessage {
		const rt = this.get(roomId);
		const s = rt.state;
		const trimmed = String(text ?? '').trim().slice(0, CHAT_MAX_LEN);
		if (!trimmed) throw new WsError('BAD_REQUEST', 'empty message');
		if (!this.isMember(rt, user.id)) throw new WsError('NOT_IN_ROOM', 'join the room first');
		const msg: ChatMessage = { id: randomUUID(), roomId, from: this.player(user, true), text: trimmed, at: this.now() };
		s.chat = [...s.chat, msg].slice(-CHAT_KEEP);
		this.persist(rt);
		this.emitter?.chat(roomId, msg);
		return msg;
	}

	/** Membership check for the generic action broadcast. */
	assertMember(user: AuthUser, roomId: string): void {
		if (!this.isMember(this.get(roomId), user.id)) throw new WsError('NOT_IN_ROOM', 'join the room first');
	}

	/** Server-side flag check (also driven by the timer). */
	checkFlag(roomId: string): void {
		const rt = this.rooms.get(roomId);
		if (!rt?.state.clock || rt.state.result) return;
		const c = checkFlag(rt.state.clock, this.now());
		if (c.flagged) {
			rt.state.clock = c;
			this.end(rt, { winner: other(c.flagged), reason: 'timeout' });
		} else this.scheduleFlag(rt);
	}

	// ── internals ────────────────────────────────────────────────────

	private end(rt: RoomRuntime, result: GameResult): void {
		if (rt.state.result) return;
		if (rt.flagTimer) clearTimeout(rt.flagTimer);
		rt.flagTimer = undefined;
		const s = rt.state;
		s.result = result;
		s.drawOfferFrom = undefined;
		if (s.clock?.running) {
			// Freeze the clock at the end position.
			const now = this.now();
			const running = s.clock.running;
			s.clock = {
				...s.clock,
				remaining: { ...s.clock.remaining, [running]: remainingAt(s.clock, running, now) },
				running: null,
				lastStartedAt: null,
			};
		}
		this.persist(rt);
		this.emitter?.ended(s.id, result, s);
	}

	private scheduleFlag(rt: RoomRuntime): void {
		if (rt.flagTimer) clearTimeout(rt.flagTimer);
		rt.flagTimer = undefined;
		const c = rt.state.clock;
		if (!c?.running || rt.state.result) return;
		const ms = remainingAt(c, c.running, this.now()) + (c.delayRemaining ?? 0);
		rt.flagTimer = setTimeout(() => this.checkFlag(rt.state.id), Math.max(0, ms) + 25);
		rt.flagTimer.unref();
	}

	private requirePlaying(rt: RoomRuntime, user: AuthUser): Color {
		if (rt.state.result) throw new WsError('GAME_OVER', 'game is over');
		const seat = this.seatOf(rt.state, user.id);
		if (!seat) throw new WsError('NOT_A_PLAYER', 'only players can do that');
		return seat;
	}

	private isMember(rt: RoomRuntime, userId: string): boolean {
		return !!this.seatOf(rt.state, userId) || rt.state.spectators.some((p) => p.userId === userId);
	}

	private seatOf(s: RoomState, userId: string): Color | undefined {
		if (s.players.white?.userId === userId) return 'white';
		if (s.players.black?.userId === userId) return 'black';
		return undefined;
	}

	private player(user: AuthUser, connected: boolean): PlayerInfo {
		return { userId: user.id, displayName: user.displayName, connected };
	}

	private validateClock(c: ClockConfig): void {
		const ok =
			Number.isFinite(c.initialMs) &&
			c.initialMs >= 1000 &&
			c.initialMs <= 3 * 3600_000 &&
			Number.isFinite(c.incrementMs) &&
			c.incrementMs >= 0 &&
			c.incrementMs <= 180_000 &&
			(c.delayMs === undefined || (Number.isFinite(c.delayMs) && c.delayMs >= 0 && c.delayMs <= 180_000));
		if (!ok) throw new WsError('BAD_REQUEST', 'invalid clock config');
	}

	private get(roomId: string): RoomRuntime {
		const rt = this.rooms.get(String(roomId));
		if (!rt) throw new WsError('NOT_FOUND', 'room not found');
		return rt;
	}

	/** In-memory room, else rehydrate from the Redis mirror. */
	private async load(roomId: string): Promise<RoomRuntime> {
		const hit = this.rooms.get(String(roomId));
		if (hit) return hit;
		if (this.cache.kind === 'redis') {
			const state = await this.cache.get<RoomState>(`room:${roomId}`);
			if (state) {
				const fens = [state.startFen];
				for (const m of state.moves) {
					const r = applyUci(fens[fens.length - 1]!, m);
					if (r) fens.push(r.fen);
				}
				const rt: RoomRuntime = { state, fens, moveIds: new Map(), connections: new Map() };
				for (const p of [state.players.white, state.players.black]) if (p) p.connected = false;
				state.spectators = [];
				this.rooms.set(state.id, rt);
				this.scheduleFlag(rt);
				this.logger.log(`room ${state.id} rehydrated from Redis`);
				return rt;
			}
		}
		throw new WsError('NOT_FOUND', 'room not found');
	}

	private persist(rt: RoomRuntime): void {
		if (this.cache.kind !== 'redis') return;
		this.cache.set(`room:${rt.state.id}`, rt.state, this.ttl).catch((err: Error) => this.logger.warn(`room mirror failed: ${err.message}`));
	}
}

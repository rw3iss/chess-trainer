import type { Color, GameResult, Uci } from '../chess/types.js';
import type { ClockConfig, ClockState } from '../clock/types.js';
import type { AnalyzeOptions, EngineInfo, EngineMeta, PlayOptions } from '../engine/types.js';
import type { SavedGame, Session } from '../game/types.js';

export const PROTOCOL_VERSION = 1 as const;

// ── REST ───────────────────────────────────────────────────────────────

/** Success shape (server ResponseInterceptor). */
export interface ApiSuccess<T> {
	data: T;
	timestamp: string;
}

/** Error shape (server AllExceptionsFilter). */
export interface ApiError {
	error: { code: string; message: string; details?: unknown; timestamp: string; path: string };
}

export interface HealthDto {
	status: 'ok';
	name: string;
	version: string;
	protocol: typeof PROTOCOL_VERSION;
	features: { auth: boolean; explorer: boolean; engines: boolean; rooms: boolean; sync: boolean };
}

export interface LoginRequest {
	username: string;
	password: string;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken: string;
	/** Seconds until accessToken expires. */
	expiresIn: number;
	user: UserDto;
}

export interface UserDto {
	id: string;
	username: string;
	displayName: string;
	role: 'owner' | 'user' | 'guest';
}

export interface GuestTokenRequest {
	displayName: string;
}

export type ExplorerSource = 'lichess' | 'masters';

export interface ExplorerMove {
	uci: Uci;
	san: string;
	white: number;
	draws: number;
	black: number;
	averageRating?: number;
}

export interface ExplorerResult {
	fen: string;
	source: ExplorerSource;
	white: number;
	draws: number;
	black: number;
	moves: ExplorerMove[];
	opening?: { eco: string; name: string };
	cachedAt: string;
}

export interface SyncRequest {
	/** Client items changed since last sync. Server keeps the higher `revision` (tie: later `updatedAt`). */
	savedGames: SavedGame[];
	sessions: Session[];
	deletedSavedGameIds: string[];
	deletedSessionIds: string[];
	/** ISO time of last successful sync. */
	since?: string;
}

export interface SyncResponse {
	savedGames: SavedGame[];
	sessions: Session[];
	deletedSavedGameIds: string[];
	deletedSessionIds: string[];
	serverTime: string;
}

export interface RemoteEngineDto extends EngineMeta {
	available: boolean;
	/** Why unavailable (e.g. 'binary not found at /opt/engines/komodo'). */
	reason?: string;
}

// ── WebSocket ──────────────────────────────────────────────────────────

/** Every WS message (both directions) is wrapped in this envelope. */
export interface WsEnvelope<T = unknown> {
	v: typeof PROTOCOL_VERSION;
	type: string;
	/** Client-generated id; acks echo it. Also the idempotency key for moves. */
	id: string;
	payload: T;
}

export interface WsAck<T = unknown> {
	ok: boolean;
	data?: T;
	error?: { code: string; message: string };
}

/** Namespace '/engine' — remote engine sessions. */
export const EngineEvents = {
	start: 'engine:start',
	position: 'engine:position',
	go: 'engine:go',
	stop: 'engine:stop',
	info: 'engine:info',
	bestmove: 'engine:bestmove',
	error: 'engine:error',
	close: 'engine:close',
} as const;

export interface EngineStartPayload {
	engineId: string;
}
export interface EngineStartResult {
	engineSessionId: string;
	meta: EngineMeta;
}
export interface EnginePositionPayload {
	engineSessionId: string;
	fen: string;
	moves: Uci[];
}
export interface EngineGoPayload {
	engineSessionId: string;
	mode: 'play' | 'analyze';
	play?: PlayOptions;
	analyze?: AnalyzeOptions;
}
export interface EngineInfoPayload {
	engineSessionId: string;
	info: EngineInfo;
}
export interface EngineBestMovePayload {
	engineSessionId: string;
	uci: Uci;
	info?: EngineInfo;
}

/** Namespace '/play' — online rooms. */
export const RoomEvents = {
	create: 'room:create',
	join: 'room:join',
	leave: 'room:leave',
	state: 'room:state',
	resync: 'room:resync',
	move: 'game:move',
	moved: 'game:moved',
	resign: 'game:resign',
	drawOffer: 'game:draw-offer',
	drawAnswer: 'game:draw-answer',
	ended: 'game:ended',
	chat: 'chat:message',
	action: 'action',
	presence: 'presence',
} as const;

export interface PlayerInfo {
	userId: string;
	displayName: string;
	connected: boolean;
}

export interface ChatMessage {
	id: string;
	roomId: string;
	from: PlayerInfo;
	text: string;
	at: number;
}

export interface RoomState {
	id: string;
	name: string;
	createdAt: number;
	players: Partial<Record<Color, PlayerInfo>>;
	spectators: PlayerInfo[];
	startFen: string;
	moves: Uci[];
	fen: string;
	clock?: ClockState;
	result?: GameResult;
	drawOfferFrom?: Color;
	chat: ChatMessage[];
}

export interface RoomCreatePayload {
	name?: string;
	clock?: ClockConfig;
	color: Color | 'random';
	startFen?: string;
}
export interface RoomJoinPayload {
	roomId: string;
}
export interface RoomJoinResult {
	room: RoomState;
	/** Seat assigned to the caller; 'spectator' when both seats are taken. */
	seat: Color | 'spectator';
}
export interface GameMovePayload {
	roomId: string;
	uci: Uci;
}
export interface GameMovedPayload {
	roomId: string;
	uci: Uci;
	san: string;
	fen: string;
	ply: number;
	clock?: ClockState;
}
export interface ChatPayload {
	roomId: string;
	text: string;
}
/** Generic extension point: arbitrary typed actions broadcast to a room. */
export interface RoomActionPayload<T = unknown> {
	roomId: string;
	type: string;
	payload: T;
}

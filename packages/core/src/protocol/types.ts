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
	/** `passwordReset`: the server can email reset links (a mail provider is configured). Optional for older servers. */
	features: {
		auth: boolean;
		explorer: boolean;
		engines: boolean;
		rooms: boolean;
		sync: boolean;
		passwordReset?: boolean;
		/** Account creation: 'open' (anyone), 'invite' (needs an invite code), 'off'. Absent on older servers = 'off'. */
		signup?: SignupMode;
		/** Sign-in providers configured on the server, e.g. ['google']. */
		oauth?: OAuthProviderId[];
	};
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
	/** Account email (password reset links). Only on account endpoints (/users/me, login, refresh); never for guests. */
	email?: string | null;
	/** False for accounts created by a sign-in provider that never set a password (change password needs no current one). */
	hasPassword?: boolean;
}

export type SignupMode = 'open' | 'invite' | 'off';
export type OAuthProviderId = 'google' | 'lichess';

/** Usernames: 3–24 chars, lower-case letters, digits, '_' and '-'; stored lower-case. */
export const USERNAME_RE = /^[a-z0-9_-]{3,24}$/;

/**
 * POST /auth/register (public) → AuthTokens. 403 when sign-up is off or needs an invite; 409 username or
 * email taken; 400 invalid; 429 rate limited. `invite` = code from an invite link (`/signup?invite=…`).
 */
export interface RegisterRequest {
	username: string;
	password: string;
	displayName?: string;
	email?: string;
	invite?: string;
}

/**
 * POST /auth/oauth/:provider/start → { url } (navigate the window there).
 * mode 'signin' (public): sign in, or create an account when sign-up allows it.
 * mode 'link' (bearer required): link the provider to the signed-in account.
 * `appOrigin` = window.location.origin; `apiBase` = absolute server base URL the browser uses (e.g.
 * https://chess.ryanweiss.net/api). Both must be allowed origins on the server.
 * After the provider, the server redirects to `<appOrigin>/auth/callback#code=…` (or `#error=<message>`).
 */
export interface OAuthStartRequest {
	mode: 'signin' | 'link';
	appOrigin: string;
	apiBase: string;
	/** App path to return to after sign-in (default '/'). */
	returnTo?: string;
	invite?: string;
}

/** POST /auth/oauth/exchange { code } (public, single use, 2 min) → AuthTokens + where to go. */
export interface OAuthExchangeResponse extends AuthTokens {
	returnTo: string;
	/** True when this sign-in created the account. */
	created: boolean;
	/** True when the call linked a provider to an existing signed-in account. */
	linked: boolean;
}

/** GET /users/me/identities → IdentityDto[]; DELETE /users/me/identities/:provider (409 when it is the only way to sign in). */
export interface IdentityDto {
	provider: OAuthProviderId;
	/** Name or email shown for the link. */
	label: string;
	linkedAt: number;
}

/**
 * POST /invites { email, message? } (signed in) → InviteDto: emails the friend a sign-up link and returns it
 * (to share by hand too). 429 after 10 per day. GET /invites/:code (public) → InvitePreview (404 unknown/used).
 */
export interface InviteRequest {
	email: string;
	message?: string;
}

export interface InviteDto {
	code: string;
	link: string;
	email: string;
	createdAt: number;
	acceptedAt: number | null;
}

export interface InvitePreview {
	inviter: { username: string; displayName: string };
	email: string;
}

/** Minimum password length (server-enforced; the client checks it first). */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * POST /auth/password/forgot (public). `identifier` = username or email. Always 202 `{ sent: true }`
 * (no account enumeration); 429 when rate limited; 503 when the server has no mail provider.
 * The email links to `<APP_PUBLIC_URL>/reset-password?token=…` (valid 1 h, single use).
 */
export interface ForgotPasswordRequest {
	identifier: string;
}

/** POST /auth/password/reset (public) → AuthTokens (signed in). 400 for an invalid, used or expired token. Signs out every other session. */
export interface ResetPasswordRequest {
	token: string;
	password: string;
}

/** POST /auth/password/change (signed in) → AuthTokens. 401 when currentPassword is wrong. Signs out every other session. */
export interface ChangePasswordRequest {
	currentPassword: string;
	newPassword: string;
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

// ApiClient — the contract for SERVER-ONLY data (PLAN §4.5 mock layer).
// Local data (sessions, games, favorites, themes, notes, settings) never goes
// through here — it lives in repositories (services/db). Components and stores
// depend on this interface only; the concrete adapter is chosen in ./index.ts.
import type {
	AuthTokens,
	ChangePasswordRequest,
	ExplorerResult,
	ExplorerSource,
	ForgotPasswordRequest,
	GuestTokenRequest,
	HealthDto,
	LoginRequest,
	RemoteEngineDto,
	ResetPasswordRequest,
	RoomState,
	SyncRequest,
	SyncResponse,
	UserDto,
} from '@chess/core/protocol';

export interface RoomSummary {
	id: string;
	name: string;
	createdAt: number;
	players: RoomState['players'];
	spectators: number;
	inProgress: boolean;
}

/** PATCH /users/me body ('' email clears it). */
export interface UpdateAccountRequest {
	displayName?: string;
	email?: string;
}

/** Password + account endpoints (signed-in calls send the bearer token). */
export interface AccountApi {
	/** Always resolves `{ sent: true }` for unknown accounts too (no enumeration). */
	forgotPassword(req: ForgotPasswordRequest): Promise<{ sent: boolean }>;
	/** Single-use reset link token → signed in. */
	resetPassword(req: ResetPasswordRequest): Promise<AuthTokens>;
	/** Signed in: new tokens (other sessions are signed out). */
	changePassword(req: ChangePasswordRequest): Promise<AuthTokens>;
	/** GET /users/me (includes email). */
	account(): Promise<UserDto>;
	updateAccount(req: UpdateAccountRequest): Promise<UserDto>;
}

export interface ApiClient extends AccountApi {
	/** Which adapter is active — 'mock' when the server is offline/unconfigured. */
	readonly kind: 'http' | 'mock';
	health(): Promise<HealthDto>;
	login(req: LoginRequest): Promise<AuthTokens>;
	refresh(refreshToken: string): Promise<AuthTokens>;
	guest(req: GuestTokenRequest): Promise<AuthTokens>;
	me(): Promise<UserDto>;
	explorer(fen: string, source?: ExplorerSource): Promise<ExplorerResult>;
	engines(): Promise<RemoteEngineDto[]>;
	sync(req: SyncRequest): Promise<SyncResponse>;
	rooms(): Promise<RoomSummary[]>;
}

export class ApiRequestError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code = 'request_failed',
		readonly details?: unknown,
	) {
		super(message);
		this.name = 'ApiRequestError';
	}
}

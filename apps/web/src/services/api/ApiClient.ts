// ApiClient — the contract for SERVER-ONLY data (PLAN §4.5 mock layer).
// Local data (sessions, games, favorites, themes, notes, settings) never goes
// through here — it lives in repositories (services/db). Components and stores
// depend on this interface only; the concrete adapter is chosen in ./index.ts.
import type {
	AuthTokens,
	ChangePasswordRequest,
	DeleteAccountRequest,
	DeviceSessionDto,
	OwnerResetLinkDto,
	RecoverPasswordRequest,
	RecoveryCodesResponse,
	ExplorerResult,
	ExplorerSource,
	ForgotPasswordRequest,
	GuestTokenRequest,
	HealthDto,
	IdentityDto,
	InviteDto,
	InvitePreview,
	InviteRequest,
	OAuthExchangeResponse,
	OAuthProviderId,
	OAuthStartRequest,
	RegisterRequest,
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

/** Avatar upload field name (multipart). */
export const AVATAR_FIELD = 'file';

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
	/** POST /auth/register → signed in. */
	register(req: RegisterRequest): Promise<AuthTokens>;
	/** POST /auth/oauth/:provider/start → provider URL to navigate to ('link' mode sends the bearer). */
	oauthStart(provider: OAuthProviderId, req: OAuthStartRequest): Promise<{ url: string }>;
	/** POST /auth/oauth/exchange — single-use code from /auth/callback. */
	oauthExchange(code: string): Promise<OAuthExchangeResponse>;
	/** GET /users/me/identities */
	identities(): Promise<IdentityDto[]>;
	/** DELETE /users/me/identities/:provider (409 when it is the only way to sign in). */
	unlinkIdentity(provider: OAuthProviderId): Promise<void>;
	/** POST /invites — emails the friend a sign-up link. */
	createInvite(req: InviteRequest): Promise<InviteDto>;
	/** GET /invites — invites I sent. */
	invites(): Promise<InviteDto[]>;
	/** GET /invites/:code (public). */
	invitePreview(code: string): Promise<InvitePreview>;
	/** POST /auth/email/verify (public) — token from the verify email. */
	verifyEmail(token: string): Promise<{ email: string }>;
	/** POST /users/me/email/verify — send the verify link again. */
	resendVerification(): Promise<void>;
	/** GET /users/me/sessions — signed-in devices. */
	sessions(): Promise<DeviceSessionDto[]>;
	/** DELETE /users/me/sessions/:id — sign that device out. */
	revokeSession(id: string): Promise<void>;
	/** POST /auth/logout (public) — ends the session of this refresh token. */
	logout(refreshToken: string): Promise<void>;
	/** POST /users/me/recovery-codes — 8 new codes (old ones stop working). */
	createRecoveryCodes(currentPassword: string): Promise<RecoveryCodesResponse>;
	/** GET /users/me/recovery-codes — unused codes left. */
	recoveryCodesLeft(): Promise<{ remaining: number }>;
	/** POST /auth/password/recover (public) — recovery code + new password → signed in. */
	recoverPassword(req: RecoverPasswordRequest): Promise<AuthTokens>;
	/** PUT /users/me/avatar (multipart `file`). */
	uploadAvatar(file: Blob): Promise<UserDto>;
	/** DELETE /users/me/avatar. */
	deleteAvatar(): Promise<UserDto>;
	/** DELETE /users/me — the account and its server data. */
	deleteAccount(req: DeleteAccountRequest): Promise<void>;
	/** Owner: POST /admin/users/:username/reset-link. */
	ownerResetLink(username: string): Promise<OwnerResetLinkDto>;
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

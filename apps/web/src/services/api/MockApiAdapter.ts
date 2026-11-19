// Offline / demo adapter backed by src/mock/data/*.json fixtures.
// Used whenever ServerConnector is not 'online', so every server-backed UI
// renders realistic data without a backend (build-skill mock-layer rule).
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
	SyncRequest,
	SyncResponse,
	UserDto,
} from '@chess/core/protocol';
import healthFixture from '@/mock/data/health.json';
import userFixture from '@/mock/data/user.json';
import explorerFixture from '@/mock/data/explorer.json';
import enginesFixture from '@/mock/data/engines.json';
import roomsFixture from '@/mock/data/rooms.json';
import type { ApiClient, RoomSummary, UpdateAccountRequest } from './ApiClient';

const LATENCY_MS = 120;

function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
}

function tokens(user: UserDto): AuthTokens {
	return { accessToken: 'mock-access', refreshToken: 'mock-refresh', expiresIn: 3600, user };
}

export class MockApiAdapter implements ApiClient {
	readonly kind = 'mock' as const;

	constructor(private latencyMs = LATENCY_MS) {}

	health(): Promise<HealthDto> {
		return delay(healthFixture as HealthDto, this.latencyMs);
	}
	login(req: LoginRequest): Promise<AuthTokens> {
		return delay(tokens({ ...(userFixture as UserDto), username: req.username }), this.latencyMs);
	}
	refresh(): Promise<AuthTokens> {
		return delay(tokens(userFixture as UserDto), this.latencyMs);
	}
	guest(req: GuestTokenRequest): Promise<AuthTokens> {
		return delay(tokens({ id: 'guest', username: 'guest', displayName: req.displayName, role: 'guest' }), this.latencyMs);
	}
	me(): Promise<UserDto> {
		return delay(userFixture as UserDto, this.latencyMs);
	}
	forgotPassword(_req: ForgotPasswordRequest): Promise<{ sent: boolean }> {
		return delay({ sent: true }, this.latencyMs);
	}
	resetPassword(_req: ResetPasswordRequest): Promise<AuthTokens> {
		return delay(tokens(userFixture as UserDto), this.latencyMs);
	}
	changePassword(_req: ChangePasswordRequest): Promise<AuthTokens> {
		return delay(tokens(userFixture as UserDto), this.latencyMs);
	}
	account(): Promise<UserDto> {
		return delay({ email: null, ...(userFixture as UserDto) }, this.latencyMs);
	}
	register(req: RegisterRequest): Promise<AuthTokens> {
		return delay(tokens({ ...(userFixture as UserDto), username: req.username, displayName: req.displayName || req.username, email: req.email ?? null, hasPassword: true }), this.latencyMs);
	}
	oauthStart(_provider: OAuthProviderId, _req: OAuthStartRequest): Promise<{ url: string }> {
		return Promise.reject(new Error('Sign-in providers need a server.'));
	}
	oauthExchange(_code: string): Promise<OAuthExchangeResponse> {
		return Promise.reject(new Error('Sign-in providers need a server.'));
	}
	identities(): Promise<IdentityDto[]> {
		return delay([], this.latencyMs);
	}
	unlinkIdentity(_provider: OAuthProviderId): Promise<void> {
		return delay(undefined, this.latencyMs);
	}
	createInvite(req: InviteRequest): Promise<InviteDto> {
		return delay({ code: 'mock-invite', link: '/signup?invite=mock-invite', email: req.email, createdAt: Date.now(), acceptedAt: null }, this.latencyMs);
	}
	invites(): Promise<InviteDto[]> {
		return delay([], this.latencyMs);
	}
	invitePreview(_code: string): Promise<InvitePreview> {
		return delay({ inviter: { username: 'demo', displayName: 'Demo' }, email: '' }, this.latencyMs);
	}
	updateAccount(req: UpdateAccountRequest): Promise<UserDto> {
		const { email, ...rest } = req;
		return delay({ ...(userFixture as UserDto), ...rest, email: email === undefined ? null : email || null }, this.latencyMs);
	}
	verifyEmail(_token: string): Promise<{ email: string }> {
		return Promise.reject(new Error('Email verification needs a server.'));
	}
	resendVerification(): Promise<void> {
		return delay(undefined, this.latencyMs);
	}
	sessions(): Promise<DeviceSessionDto[]> {
		return delay([{ id: 'mock-session', label: 'This browser', createdAt: Date.now(), lastUsedAt: Date.now(), current: true }], this.latencyMs);
	}
	revokeSession(_id: string): Promise<void> {
		return delay(undefined, this.latencyMs);
	}
	logout(_refreshToken: string): Promise<void> {
		return delay(undefined, this.latencyMs);
	}
	createRecoveryCodes(_currentPassword: string): Promise<RecoveryCodesResponse> {
		return delay({ codes: Array.from({ length: 8 }, (_, i) => `mock-code-${i + 1}`) }, this.latencyMs);
	}
	recoveryCodesLeft(): Promise<{ remaining: number }> {
		return delay({ remaining: 0 }, this.latencyMs);
	}
	recoverPassword(_req: RecoverPasswordRequest): Promise<AuthTokens> {
		return Promise.reject(new Error('Password recovery needs a server.'));
	}
	uploadAvatar(_file: Blob): Promise<UserDto> {
		return Promise.reject(new Error('Avatars need a server.'));
	}
	deleteAvatar(): Promise<UserDto> {
		return delay({ ...(userFixture as UserDto), avatarUrl: null }, this.latencyMs);
	}
	deleteAccount(_req: DeleteAccountRequest): Promise<void> {
		return Promise.reject(new Error('Deleting an account needs a server.'));
	}
	ownerResetLink(username: string): Promise<OwnerResetLinkDto> {
		return delay({ link: `/reset-password?token=mock-${username}`, expiresAt: Date.now() + 3_600_000 }, this.latencyMs);
	}
	explorer(fen: string, source: ExplorerSource = 'lichess'): Promise<ExplorerResult> {
		return delay({ ...(explorerFixture as ExplorerResult), fen, source }, this.latencyMs);
	}
	engines(): Promise<RemoteEngineDto[]> {
		return delay(enginesFixture as RemoteEngineDto[], this.latencyMs);
	}
	sync(req: SyncRequest): Promise<SyncResponse> {
		// Offline: nothing to merge — echo back so callers can treat it as a no-op round trip.
		return delay(
			{ savedGames: [], sessions: [], deletedSavedGameIds: req.deletedSavedGameIds, deletedSessionIds: req.deletedSessionIds, serverTime: new Date().toISOString() },
			this.latencyMs,
		);
	}
	rooms(): Promise<RoomSummary[]> {
		return delay(roomsFixture as RoomSummary[], this.latencyMs);
	}
}

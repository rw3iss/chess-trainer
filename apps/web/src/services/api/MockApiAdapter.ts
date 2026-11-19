// Offline / demo adapter backed by src/mock/data/*.json fixtures.
// Used whenever ServerConnector is not 'online', so every server-backed UI
// renders realistic data without a backend (build-skill mock-layer rule).
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
	updateAccount(req: UpdateAccountRequest): Promise<UserDto> {
		const { email, ...rest } = req;
		return delay({ ...(userFixture as UserDto), ...rest, email: email === undefined ? null : email || null }, this.latencyMs);
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

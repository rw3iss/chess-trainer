// Real server adapter: fetch + unwrap the server's `{ data, timestamp }` envelope
// and map `{ error }` bodies to ApiRequestError.
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
import { AVATAR_FIELD, ApiRequestError, type ApiClient, type RoomSummary, type UpdateAccountRequest } from './ApiClient';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface HttpApiOptions {
	baseUrl: string;
	getToken?: () => string | null;
	/** Called once on a 401 when a token was sent; resolve a new token to retry with (null = give up). */
	onUnauthorized?: () => Promise<string | null>;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}

function unwrap<T>(body: unknown): T {
	if (body && typeof body === 'object' && 'data' in body) return (body as { data: T }).data;
	return body as T;
}

export class HttpApiAdapter implements ApiClient {
	readonly kind = 'http' as const;
	private base: string;

	constructor(private opts: HttpApiOptions) {
		this.base = opts.baseUrl.replace(/\/+$/, '');
	}

	private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		try {
			return await this.send<T>(method, path, body, this.opts.getToken?.() ?? null);
		} catch (e) {
			// Expired access token → refresh once and retry.
			if (!(e instanceof ApiRequestError) || e.status !== 401 || !this.opts.getToken?.() || !this.opts.onUnauthorized) throw e;
			const fresh = await this.opts.onUnauthorized();
			if (!fresh) throw e;
			return this.send<T>(method, path, body, fresh);
		}
	}

	private async send<T>(method: string, path: string, body: unknown, token: string | null): Promise<T> {
		const fetchImpl = this.opts.fetchImpl ?? fetch;
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
		const headers: Record<string, string> = { Accept: 'application/json' };
		// FormData (avatar upload): the browser sets the multipart boundary.
		const form = typeof FormData !== 'undefined' && body instanceof FormData;
		if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
		if (token) headers.Authorization = `Bearer ${token}`;
		try {
			const res = await fetchImpl(`${this.base}${path}`, {
				method,
				headers,
				body: body === undefined ? undefined : form ? (body as FormData) : JSON.stringify(body),
				signal: ctrl.signal,
			});
			const text = await res.text();
			const json: unknown = text ? JSON.parse(text) : undefined;
			if (!res.ok) {
				const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
				throw new ApiRequestError(err?.message ?? res.statusText, res.status, err?.code, err?.details);
			}
			return unwrap<T>(json);
		} catch (e) {
			if (e instanceof ApiRequestError) throw e;
			throw new ApiRequestError(e instanceof Error ? e.message : String(e), 0, 'network');
		} finally {
			clearTimeout(timer);
		}
	}

	async health(): Promise<HealthDto> {
		const h = await this.request<Partial<HealthDto>>('GET', '/health');
		return {
			status: 'ok',
			name: h.name ?? 'chess-server',
			version: h.version ?? '0.0.0',
			protocol: 1,
			features: { auth: false, explorer: false, engines: false, rooms: false, sync: false, ...h.features },
		};
	}
	login(req: LoginRequest): Promise<AuthTokens> {
		return this.request('POST', '/auth/login', req);
	}
	refresh(refreshToken: string): Promise<AuthTokens> {
		return this.request('POST', '/auth/refresh', { refreshToken });
	}
	guest(req: GuestTokenRequest): Promise<AuthTokens> {
		return this.request('POST', '/auth/guest', req);
	}
	me(): Promise<UserDto> {
		return this.request('GET', '/auth/me');
	}
	forgotPassword(req: ForgotPasswordRequest): Promise<{ sent: boolean }> {
		return this.request('POST', '/auth/password/forgot', req);
	}
	resetPassword(req: ResetPasswordRequest): Promise<AuthTokens> {
		return this.request('POST', '/auth/password/reset', req);
	}
	changePassword(req: ChangePasswordRequest): Promise<AuthTokens> {
		return this.request('POST', '/auth/password/change', req);
	}
	account(): Promise<UserDto> {
		return this.request('GET', '/users/me');
	}
	updateAccount(req: UpdateAccountRequest): Promise<UserDto> {
		return this.request('PATCH', '/users/me', req);
	}
	register(req: RegisterRequest): Promise<AuthTokens> {
		return this.request('POST', '/auth/register', req);
	}
	oauthStart(provider: OAuthProviderId, req: OAuthStartRequest): Promise<{ url: string }> {
		return this.request('POST', `/auth/oauth/${encodeURIComponent(provider)}/start`, req);
	}
	oauthExchange(code: string): Promise<OAuthExchangeResponse> {
		return this.request('POST', '/auth/oauth/exchange', { code });
	}
	identities(): Promise<IdentityDto[]> {
		return this.request('GET', '/users/me/identities');
	}
	async unlinkIdentity(provider: OAuthProviderId): Promise<void> {
		await this.request('DELETE', `/users/me/identities/${encodeURIComponent(provider)}`);
	}
	createInvite(req: InviteRequest): Promise<InviteDto> {
		return this.request('POST', '/invites', req);
	}
	invites(): Promise<InviteDto[]> {
		return this.request('GET', '/invites');
	}
	invitePreview(code: string): Promise<InvitePreview> {
		return this.request('GET', `/invites/${encodeURIComponent(code)}`);
	}
	verifyEmail(token: string): Promise<{ email: string }> {
		return this.request('POST', '/auth/email/verify', { token });
	}
	async resendVerification(): Promise<void> {
		await this.request('POST', '/users/me/email/verify');
	}
	sessions(): Promise<DeviceSessionDto[]> {
		return this.request('GET', '/users/me/sessions');
	}
	async revokeSession(id: string): Promise<void> {
		await this.request('DELETE', `/users/me/sessions/${encodeURIComponent(id)}`);
	}
	async logout(refreshToken: string): Promise<void> {
		await this.request('POST', '/auth/logout', { refreshToken });
	}
	createRecoveryCodes(currentPassword: string): Promise<RecoveryCodesResponse> {
		return this.request('POST', '/users/me/recovery-codes', { currentPassword });
	}
	recoveryCodesLeft(): Promise<{ remaining: number }> {
		return this.request('GET', '/users/me/recovery-codes');
	}
	recoverPassword(req: RecoverPasswordRequest): Promise<AuthTokens> {
		return this.request('POST', '/auth/password/recover', req);
	}
	uploadAvatar(file: Blob): Promise<UserDto> {
		const form = new FormData();
		const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/jpeg' ? 'jpg' : 'png';
		form.append(AVATAR_FIELD, file, `avatar.${ext}`);
		return this.request('PUT', '/users/me/avatar', form);
	}
	deleteAvatar(): Promise<UserDto> {
		return this.request('DELETE', '/users/me/avatar');
	}
	async deleteAccount(req: DeleteAccountRequest): Promise<void> {
		await this.request('DELETE', '/users/me', req);
	}
	ownerResetLink(username: string): Promise<OwnerResetLinkDto> {
		return this.request('POST', `/admin/users/${encodeURIComponent(username)}/reset-link`);
	}
	explorer(fen: string, source: ExplorerSource = 'lichess'): Promise<ExplorerResult> {
		const q = new URLSearchParams({ fen, source });
		return this.request('GET', `/explorer?${q}`);
	}
	engines(): Promise<RemoteEngineDto[]> {
		return this.request('GET', '/engines');
	}
	sync(req: SyncRequest): Promise<SyncResponse> {
		return this.request('POST', '/sync', req);
	}
	rooms(): Promise<RoomSummary[]> {
		return this.request('GET', '/rooms');
	}
}

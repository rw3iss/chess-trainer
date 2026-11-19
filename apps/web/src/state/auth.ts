// Auth store — owner/user login against the optional server + guest tokens for rooms.
//
// Read:   authUser, isLoggedIn, authBusy, authError, guestName, accessToken()
// Write:  authActions.login / logout / refresh / setGuestName
//         authActions.forgotPassword / resetPassword / changePassword / updateEmail / loadAccount
//           / verifyEmail / resendVerification / sessions / revokeSession / createRecoveryCodes
//           / recoveryCodesLeft / recoverPassword / uploadAvatar / deleteAvatar / deleteAccount / ownerResetLink
//           (reject with an Error whose message is user-facing; see accountErrorMessage)
//         authActions.ensureAccessToken()  → fresh user token (refreshes when < 60 s left)
//         authActions.roomToken()          → user token, else a guest token (rooms only)
//
// Tokens persist in the kv repository ('auth:session', 'auth:guest'). The access
// token is auto-refreshed REFRESH_LEAD_MS before expiry and on a 401 (via
// setUnauthorizedHandler in services/api). Auth calls go straight to the HTTP
// adapter for the configured server — never to the mock adapter.
import { computed, signal } from '@preact/signals';
import { PASSWORD_MIN_LENGTH, USERNAME_RE, type AuthTokens, type DeviceSessionDto, type IdentityDto, type InviteDto, type InvitePreview, type OAuthProviderId, type OwnerResetLinkDto, type RegisterRequest, type UserDto } from '@chess/core/protocol';
import { getDeviceRepositories } from '@/services/db';
import { ApiRequestError, HttpApiAdapter, setAuthTokenProvider, setUnauthorizedHandler, type AccountApi } from '@/services/api';
import { serverConnector } from '@/services/server';
import { defineStore } from './registry';

export const AUTH_SESSION_KEY = 'auth:session';
export const AUTH_GUEST_KEY = 'auth:guest';
export const GUEST_NAME_KEY = 'auth:guestName';
/** Refresh this long before the access token expires. */
export const REFRESH_LEAD_MS = 60_000;
/** sessionStorage: provider of the sign-in in flight (named in the callback toast). */
export const OAUTH_PROVIDER_KEY = 'chess:oauth-provider';
/** Logout waits at most this long for the server to end the session (offline: it just signs out). */
export const LOGOUT_REVOKE_TIMEOUT_MS = 1500;
const PROVIDER_LABEL: Record<OAuthProviderId, string> = { google: 'Google', lichess: 'Lichess' };

export interface StoredAuth {
	accessToken: string;
	refreshToken?: string;
	/** Epoch ms when accessToken expires. */
	expiresAt: number;
	user: UserDto;
	/** Server base URL the tokens belong to. */
	serverUrl: string;
}

/** Subset of ApiClient the auth store needs (injectable for tests). */
export interface AuthApi {
	login(req: { username: string; password: string }): Promise<AuthTokens>;
	refresh(refreshToken: string): Promise<AuthTokens>;
	guest(req: { displayName: string }): Promise<Omit<AuthTokens, 'refreshToken'> & { refreshToken?: string }>;
}

export interface AuthDeps {
	/** Client for the given server URL (default: HttpApiAdapter without auth header). */
	client: (url: string) => AuthApi;
	/** Password + account client; `token` = bearer for signed-in calls (no 401 auto-refresh: a 401 there means a wrong password). */
	account: (url: string, token: string | null) => AccountApi;
	/** Current server URL, or null when none is configured. */
	serverUrl: () => string | null;
	now: () => number;
	/** Full-page navigation (provider sign-in). */
	navigate: (url: string) => void;
}

const defaultDeps: AuthDeps = {
	client: (url) => new HttpApiAdapter({ baseUrl: url }),
	account: (url, token) => new HttpApiAdapter({ baseUrl: url, getToken: () => token }),
	serverUrl: () => serverConnector.url.value,
	now: () => Date.now(),
	navigate: (url) => window.location.assign(url),
};
let deps: AuthDeps = defaultDeps;

/** Test hook: swap the API client / clock. Pass nothing to restore defaults. */
export function configureAuth(next: Partial<AuthDeps> = {}): void {
	deps = { ...defaultDeps, ...next };
}

// ── State ─────────────────────────────────────────────────────────────────
const _session = signal<StoredAuth | null>(null);
const _guest = signal<StoredAuth | null>(null);
const _guestName = signal('');
const _busy = signal(false);
const _error = signal<string | null>(null);

/** Logged-in owner/user (null when signed out). */
export const authUser = computed(() => _session.value?.user ?? null);
export const isLoggedIn = computed(() => !!_session.value && _session.value.user.role !== 'guest');
export const authBusy = computed(() => _busy.value);
export const authError = computed(() => _error.value);
export const guestName = computed(() => _guestName.value);
/** Name shown in rooms: user display name, else the guest name. */
export const displayName = computed(() => _session.value?.user.displayName || _guestName.value || 'Guest');

/** Current user access token (may be stale — use ensureAccessToken() before requests). */
export function accessToken(): string | null {
	return _session.value?.accessToken ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function toStored(t: AuthTokens | (Omit<AuthTokens, 'refreshToken'> & { refreshToken?: string }), serverUrl: string): StoredAuth {
	return {
		accessToken: t.accessToken,
		refreshToken: t.refreshToken,
		expiresAt: deps.now() + t.expiresIn * 1000,
		user: t.user,
		serverUrl,
	};
}

function requireUrl(): string {
	const url = deps.serverUrl();
	if (!url) throw new ApiRequestError('No server configured', 0, 'unconfigured');
	return url;
}

function errorMessage(e: unknown): string {
	if (e instanceof ApiRequestError) {
		if (e.status === 401) return 'Wrong username or password.';
		if (e.status === 429) return 'Too many sign-in attempts. Try again later.';
		if (e.status === 0) return 'Server unreachable.';
		return e.message;
	}
	return e instanceof Error ? e.message : String(e);
}

type AccountAction = 'forgot' | 'reset' | 'change' | 'email' | 'load' | 'register' | 'oauth' | 'identity' | 'invite' | 'verify' | 'session' | 'codes' | 'recover' | 'avatar' | 'delete' | 'owner';

/** User-facing message for a failed password / account call. */
export function accountErrorMessage(action: AccountAction, e: unknown): string {
	if (e instanceof ApiRequestError) {
		if (e.status === 0) return e.code === 'unconfigured' ? 'Connect to a server first.' : 'Server unreachable.';
		if (e.status === 429) return 'Too many requests. Try again later.';
		if (e.status === 503 && action === 'forgot') return 'Password reset by email is not set up on this server.';
		if (e.status === 400 && action === 'reset') return 'This reset link is invalid, used or expired. Request a new one.';
		if (e.status === 401 && action === 'change') return 'The current password is wrong.';
		if (e.status === 400 && action === 'verify') return 'This verification link is invalid, used or expired. Send a new one from your profile.';
		if ((e.status === 400 || e.status === 401) && action === 'recover') return 'Wrong username or recovery code, or the code was already used.';
		if (e.status === 401 && (action === 'codes' || action === 'delete')) return 'The password is wrong.';
		if (e.status === 403 && action === 'delete') return e.message || 'This account cannot be deleted.';
		if ((e.status === 400 || e.status === 413 || e.status === 415) && action === 'avatar') return 'Use a PNG, JPEG or WebP image (at most 300 KB after resizing).';
		if (e.status === 404 && action === 'owner') return 'No user with that username.';
		if (e.status === 403 && action === 'owner') return 'Only the owner can do this.';
		if (e.status === 401) return 'Session expired — sign in again.';
		if (e.status === 409 && action === 'email') return 'Another account already uses that email.';
		if (e.status === 400 && action === 'email') return 'Enter a valid email address.';
		if (e.status === 400 && action === 'change') return `The new password must have at least ${PASSWORD_MIN_LENGTH} characters.`;
		if (e.status === 403 && action === 'register') return e.message || 'Sign-up is closed on this server.';
		if (e.status === 409 && action === 'register') return e.message || 'That username or email is taken.';
		if (e.status === 409 && action === 'identity') return 'Set a password or link another sign-in first: this is your only way to sign in.';
		if (e.status === 404 && action === 'invite') return 'This invite link is invalid or was already used.';
		if (e.status === 400 && (action === 'oauth' || action === 'register')) return e.message || 'Check the form and try again.';
		return e.message;
	}
	return e instanceof Error ? e.message : String(e);
}

async function accountCall<T>(action: AccountAction, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		throw new Error(accountErrorMessage(action, e), { cause: e });
	}
}

/** Signed-in session or a user-facing error. */
function requireSession(): StoredAuth {
	const s = _session.value;
	if (!s) throw new Error('Sign in first.');
	return s;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh(): void {
	if (refreshTimer) clearTimeout(refreshTimer);
	refreshTimer = null;
	const s = _session.value;
	if (!s?.refreshToken) return;
	const wait = Math.max(5_000, s.expiresAt - REFRESH_LEAD_MS - deps.now());
	refreshTimer = setTimeout(() => void authActions.refresh().catch(() => undefined), wait);
}

async function setSession(next: StoredAuth | null): Promise<void> {
	_session.value = next;
	scheduleRefresh();
	const kv = getDeviceRepositories().kv;
	if (next) await kv.set(AUTH_SESSION_KEY, next);
	else await kv.remove(AUTH_SESSION_KEY);
}

let refreshing: Promise<string | null> | null = null;

/** Account switching hooks (state/account.ts registers them; absent in plain tests). */
export interface SessionListener {
	/** A sign-in made `next` the session. Resolves true when the app is switching database (reload follows). */
	signedIn: (next: StoredAuth, previous: StoredAuth | null, opts: { to?: string; toast?: string }) => Promise<boolean>;
	/** Explicit sign-out (not a session expiry). */
	signedOut: () => Promise<void>;
	/** The account was deleted on the server: forget it on this device too. */
	deleted?: (s: StoredAuth) => Promise<void>;
}
let sessionListener: SessionListener | null = null;
export function setSessionListener(l: SessionListener | null): void {
	sessionListener = l;
}

/** Store a fresh sign-in and let the account layer switch database. Returns true when a switch (reload) follows. */
async function signedIn(tokens: AuthTokens, url: string, opts: { to?: string; toast?: string } = {}): Promise<boolean> {
	const previous = _session.value;
	const stored = toStored(tokens, url);
	_error.value = null;
	await setSession(stored);
	return (await sessionListener?.signedIn(stored, previous, opts)) ?? false;
}

/** Absolute base URL of the configured server (relative '/api' resolves against the page). */
export function absoluteServerUrl(url: string): string {
	const base = typeof location !== 'undefined' ? location.origin : 'http://localhost';
	return new URL(url, `${base}/`).href.replace(/\/+$/, '');
}

// ── Actions ───────────────────────────────────────────────────────────────
export const authActions = {
	async login(username: string, password: string): Promise<UserDto> {
		_busy.value = true;
		_error.value = null;
		try {
			const url = requireUrl();
			const tokens = await deps.client(url).login({ username: username.trim(), password });
			await signedIn(tokens, url, { toast: `Signed in as ${tokens.user.displayName}` });
			return tokens.user;
		} catch (e) {
			_error.value = errorMessage(e);
			throw e;
		} finally {
			_busy.value = false;
		}
	},

	/** Sign out. Tells the server to end this session (best effort, short timeout: offline still signs out). */
	async logout(): Promise<void> {
		_error.value = null;
		const s = _session.value;
		if (s?.refreshToken) {
			const revoke = deps.account(s.serverUrl, null).logout(s.refreshToken).catch(() => undefined);
			await Promise.race([revoke, new Promise((r) => setTimeout(r, LOGOUT_REVOKE_TIMEOUT_MS))]);
		}
		await setSession(null);
		await sessionListener?.signedOut();
	},

	/** Exchange the refresh token. Concurrent callers share one request. Returns the new access token (null = signed out). */
	refresh(): Promise<string | null> {
		const s = _session.value;
		// Checked before creating the shared promise: an IIFE that returns without
		// awaiting runs its `finally` before `refreshing` is assigned, leaving a
		// stale resolved promise cached for every later call.
		if (!refreshing && !s?.refreshToken) return Promise.resolve(null);
		refreshing ??= (async () => {
			if (!s?.refreshToken) return null;
			try {
				const tokens = await deps.client(s.serverUrl).refresh(s.refreshToken);
				// Signed out (or in as someone else) while the request was in flight → drop the result.
				if (_session.value !== s) return _session.value?.accessToken ?? null;
				await setSession(toStored(tokens, s.serverUrl));
				return tokens.accessToken;
			} catch (e) {
				// Rejected refresh token → sign out. Network errors keep the session for a later retry.
				if (_session.value !== s) return _session.value?.accessToken ?? null;
				if (e instanceof ApiRequestError && (e.status === 401 || e.status === 403)) {
					_error.value = 'Session expired — sign in again.';
					await setSession(null);
				} else scheduleRefresh();
				return null;
			} finally {
				refreshing = null;
			}
		})();
		return refreshing;
	},

	/** A user access token valid for at least REFRESH_LEAD_MS, or null. */
	async ensureAccessToken(): Promise<string | null> {
		const s = _session.value;
		if (!s) return null;
		if (s.expiresAt - deps.now() > REFRESH_LEAD_MS) return s.accessToken;
		return authActions.refresh();
	},

	/** Token for the /play namespace: the user's own when signed in, else a (cached) guest token. */
	async roomToken(): Promise<{ token: string; user: UserDto }> {
		const own = await authActions.ensureAccessToken();
		if (own && _session.value) return { token: own, user: _session.value.user };
		const url = requireUrl();
		const g = _guest.value;
		const name = _guestName.value.trim() || 'Guest';
		if (g && g.serverUrl === url && g.user.displayName === name && g.expiresAt - deps.now() > REFRESH_LEAD_MS) {
			return { token: g.accessToken, user: g.user };
		}
		const tokens = await deps.client(url).guest({ displayName: name });
		const stored = toStored(tokens, url);
		_guest.value = stored;
		await getDeviceRepositories().kv.set(AUTH_GUEST_KEY, stored);
		return { token: stored.accessToken, user: stored.user };
	},

	async setGuestName(name: string): Promise<void> {
		_guestName.value = name.trim().slice(0, 40);
		await getDeviceRepositories().kv.set(GUEST_NAME_KEY, _guestName.value);
	},

	clearError(): void {
		_error.value = null;
	},

	/** Ask the server to email a reset link (username or email). Resolves the same way for unknown accounts. */
	async forgotPassword(identifier: string): Promise<void> {
		const id = identifier.trim();
		if (!id) throw new Error('Enter your username or email.');
		await accountCall('forgot', async () => {
			await deps.account(requireUrl(), null).forgotPassword({ identifier: id });
		});
	},

	/** Reset-link token + new password → signed in. */
	async resetPassword(token: string, password: string): Promise<UserDto> {
		if (password.length < PASSWORD_MIN_LENGTH) throw new Error(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
		return accountCall('reset', async () => {
			const url = requireUrl();
			const tokens = await deps.account(url, null).resetPassword({ token, password });
			await signedIn(tokens, url, { to: '/profile', toast: 'Password changed — you are signed in' });
			return tokens.user;
		});
	},

	/** Signed in: change the password. The server signs out other sessions; this one gets new tokens. */
	async changePassword(currentPassword: string, newPassword: string): Promise<void> {
		// Accounts created by a sign-in provider have no password yet: no current one is needed.
		if (newPassword.length < PASSWORD_MIN_LENGTH) throw new Error(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
		await accountCall('change', async () => {
			const s = requireSession();
			const token = (await authActions.ensureAccessToken()) ?? s.accessToken;
			const tokens = await deps.account(s.serverUrl, token).changePassword({ currentPassword, newPassword });
			if (_session.value !== s && _session.value?.user.id !== s.user.id) return;
			await setSession(toStored(tokens, s.serverUrl));
		});
	},

	/** Signed in: set ('' clears) the account email used for reset links. */
	async updateEmail(email: string): Promise<UserDto> {
		return accountCall('email', async () => {
			const s = requireSession();
			const token = (await authActions.ensureAccessToken()) ?? s.accessToken;
			const user = await deps.account(s.serverUrl, token).updateAccount({ email: email.trim() });
			await patchUser(s, user);
			return _session.value?.user ?? user;
		});
	},

	/** Signed in: change the display name (1–64 characters). */
	async updateDisplayName(name: string): Promise<UserDto> {
		const displayName = name.trim();
		if (!displayName || displayName.length > 64) throw new Error('Use 1–64 characters.');
		return withAccount('load', async (a, s) => {
			const user = await a.updateAccount({ displayName });
			await patchUser(s, user);
			return _session.value?.user ?? user;
		});
	},

	/** Create an account (sign-up) → signed in, on the new account's own local database. */
	async register(req: RegisterRequest): Promise<UserDto> {
		const username = req.username.trim().toLowerCase();
		if (!USERNAME_RE.test(username)) throw new Error('Username: 3–24 characters, letters, digits, _ or -.');
		if (req.password.length < PASSWORD_MIN_LENGTH) throw new Error(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
		_busy.value = true;
		try {
			return await accountCall('register', async () => {
				const url = requireUrl();
				const body: RegisterRequest = { username, password: req.password };
				if (req.displayName?.trim()) body.displayName = req.displayName.trim();
				if (req.email?.trim()) body.email = req.email.trim();
				if (req.invite?.trim()) body.invite = req.invite.trim();
				const tokens = await deps.account(url, null).register(body);
				await signedIn(tokens, url, { to: '/', toast: `Welcome, ${tokens.user.displayName}` });
				return tokens.user;
			});
		} finally {
			_busy.value = false;
		}
	},

	/**
	 * Start a provider sign-in ('signin') or link it to this account ('link'): asks the server for the
	 * provider URL and navigates there. The provider returns to /auth/callback.
	 */
	async startOAuth(provider: OAuthProviderId, mode: 'signin' | 'link', opts: { returnTo?: string; invite?: string } = {}): Promise<string> {
		return accountCall('oauth', async () => {
			const url = requireUrl();
			let token: string | null = null;
			if (mode === 'link') {
				requireSession();
				token = await authActions.ensureAccessToken();
			}
			const appOrigin = typeof location !== 'undefined' ? location.origin : 'http://localhost';
			try {
				sessionStorage.setItem(OAUTH_PROVIDER_KEY, provider);
			} catch {
				/* private mode */
			}
			const res = await deps.account(url, token).oauthStart(provider, {
				mode,
				appOrigin,
				apiBase: absoluteServerUrl(url),
				returnTo: opts.returnTo ?? '/',
				...(opts.invite ? { invite: opts.invite } : {}),
			});
			deps.navigate(res.url);
			return res.url;
		});
	},

	/** /auth/callback: exchange the single-use code → signed in (or linked). */
	async completeOAuth(code: string, providerName?: string): Promise<{ returnTo: string; created: boolean; linked: boolean; provider: string }> {
		if (!providerName) providerName = pendingProviderName();
		return accountCall('oauth', async () => {
			const url = requireUrl();
			const res = await deps.account(url, null).oauthExchange(code);
			const msg = res.linked ? `${providerName} linked` : res.created ? 'Account created' : `Signed in with ${providerName}`;
			await signedIn(res, url, { to: res.returnTo || '/', toast: msg });
			return { returnTo: res.returnTo || '/', created: res.created, linked: res.linked, provider: providerName };
		});
	},

	async identities(): Promise<IdentityDto[]> {
		return accountCall('identity', async () => {
			const s = requireSession();
			return deps.account(s.serverUrl, (await authActions.ensureAccessToken()) ?? s.accessToken).identities();
		});
	},

	async unlinkIdentity(provider: OAuthProviderId): Promise<void> {
		await accountCall('identity', async () => {
			const s = requireSession();
			await deps.account(s.serverUrl, (await authActions.ensureAccessToken()) ?? s.accessToken).unlinkIdentity(provider);
		});
	},

	/** Email a friend a sign-up link (also returned, to share by hand). */
	async createInvite(email: string, message?: string): Promise<InviteDto> {
		const to = email.trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('Enter a valid email address.');
		return accountCall('invite', async () => {
			const s = requireSession();
			const body = message?.trim() ? { email: to, message: message.trim() } : { email: to };
			return deps.account(s.serverUrl, (await authActions.ensureAccessToken()) ?? s.accessToken).createInvite(body);
		});
	},

	async invites(): Promise<InviteDto[]> {
		return accountCall('invite', async () => {
			const s = requireSession();
			return deps.account(s.serverUrl, (await authActions.ensureAccessToken()) ?? s.accessToken).invites();
		});
	},

	/** Public: who sent an invite code (sign-up page). */
	async invitePreview(code: string): Promise<InvitePreview> {
		return accountCall('invite', async () => deps.account(requireUrl(), null).invitePreview(code));
	},

	/** Public: confirm an email with the token from the verify link. Signed in → the stored user is refreshed. */
	async verifyEmail(token: string): Promise<string> {
		const t = token.trim();
		if (!t) throw new Error('This link has no verification code.');
		return accountCall('verify', async () => {
			const res = await deps.account(requireUrl(), null).verifyEmail(t);
			const s = _session.value;
			if (s && s.user.email?.toLowerCase() === res.email.toLowerCase()) await patchUser(s, { ...s.user, emailVerified: true });
			void authActions.loadAccount().catch(() => undefined);
			return res.email;
		});
	},

	/** Signed in: email the verify link again. */
	async resendVerification(): Promise<void> {
		await withAccount('verify', (a) => a.resendVerification());
	},

	/** Signed in: devices with a session. */
	async sessions(): Promise<DeviceSessionDto[]> {
		return withAccount('session', (a) => a.sessions());
	},

	/** Signed in: sign another device out. */
	async revokeSession(id: string): Promise<void> {
		await withAccount('session', (a) => a.revokeSession(id));
	},

	/** Signed in: 8 new recovery codes (shown once; old codes stop working). '' password when the account has none. */
	async createRecoveryCodes(currentPassword: string): Promise<string[]> {
		return withAccount('codes', async (a) => (await a.createRecoveryCodes(currentPassword)).codes);
	},

	async recoveryCodesLeft(): Promise<number> {
		return withAccount('codes', async (a) => (await a.recoveryCodesLeft()).remaining);
	},

	/** Public: reset the password with a recovery code → signed in. */
	async recoverPassword(username: string, code: string, password: string): Promise<UserDto> {
		const name = username.trim();
		const c = code.trim();
		if (!name || !c) throw new Error('Enter your username and a recovery code.');
		if (password.length < PASSWORD_MIN_LENGTH) throw new Error(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
		return accountCall('recover', async () => {
			const url = requireUrl();
			const tokens = await deps.account(url, null).recoverPassword({ username: name, code: c, password });
			await signedIn(tokens, url, { to: '/profile', toast: 'Password changed — you are signed in' });
			return tokens.user;
		});
	},

	/** Signed in: upload an avatar (already cropped/resized by the caller). */
	async uploadAvatar(file: Blob): Promise<UserDto> {
		return withAccount('avatar', async (a, s) => {
			const user = await a.uploadAvatar(file);
			await patchUser(s, user);
			return _session.value?.user ?? user;
		});
	},

	async deleteAvatar(): Promise<UserDto> {
		return withAccount('avatar', async (a, s) => {
			const user = await a.deleteAvatar();
			await patchUser(s, { ...user, avatarUrl: null });
			return _session.value?.user ?? user;
		});
	},

	/** Signed in: delete the account on the server, then forget it on this device (back to anonymous). */
	async deleteAccount(password: string): Promise<void> {
		await withAccount('delete', async (a, s) => {
			await a.deleteAccount({ password });
			await setSession(null);
			if (sessionListener?.deleted) await sessionListener.deleted(s);
			else await sessionListener?.signedOut();
		});
	},

	/** Owner: a one-time password reset link for another user. */
	async ownerResetLink(username: string): Promise<OwnerResetLinkDto> {
		const name = username.trim();
		if (!name) throw new Error('Enter a username.');
		return withAccount('owner', (a) => a.ownerResetLink(name));
	},

	/** Signed in: re-read the account (email) from the server into the stored user. */
	async loadAccount(): Promise<UserDto | null> {
		const s = _session.value;
		if (!s) return null;
		return accountCall('load', async () => {
			const token = (await authActions.ensureAccessToken()) ?? s.accessToken;
			const user = await deps.account(s.serverUrl, token).account();
			await patchUser(s, user);
			return _session.value?.user ?? user;
		});
	},
};

/** Merge account fields into the stored session user (if it is still the same account). */
async function patchUser(s: StoredAuth, user: UserDto): Promise<void> {
	const cur = _session.value;
	if (!cur || cur.user.id !== s.user.id) return;
	const { id, username, displayName: name, role, email, hasPassword, emailVerified, avatarUrl, createdAt } = user;
	const next: UserDto = { ...cur.user, id, username, displayName: name, role, email: email ?? null };
	if (hasPassword !== undefined) next.hasPassword = hasPassword;
	if (emailVerified !== undefined) next.emailVerified = emailVerified;
	if (avatarUrl !== undefined) next.avatarUrl = avatarUrl;
	if (createdAt !== undefined) next.createdAt = createdAt;
	await setSession({ ...cur, user: next });
}

/** Signed-in account call with a fresh bearer token; errors become user-facing messages. */
function withAccount<T>(action: AccountAction, fn: (a: AccountApi, s: StoredAuth) => Promise<T>): Promise<T> {
	return accountCall(action, async () => {
		const s = requireSession();
		const token = (await authActions.ensureAccessToken()) ?? s.accessToken;
		return fn(deps.account(s.serverUrl, token), s);
	});
}

/** Name of the provider of the sign-in in flight (set by startOAuth), default Google. */
function pendingProviderName(): string {
	try {
		const p = sessionStorage.getItem(OAUTH_PROVIDER_KEY) as OAuthProviderId | null;
		sessionStorage.removeItem(OAUTH_PROVIDER_KEY);
		if (p && p in PROVIDER_LABEL) return PROVIDER_LABEL[p];
	} catch {
		/* private mode */
	}
	return 'Google';
}

/** Absolute avatar URL for a user (avatarUrl is relative to the server base), or null. */
export function avatarSrc(user: Pick<UserDto, 'avatarUrl'> | null | undefined, serverUrl: string | null | undefined): string | null {
	if (!user?.avatarUrl || !serverUrl) return null;
	if (/^(https?:|data:|blob:)/.test(user.avatarUrl)) return user.avatarUrl;
	return `${absoluteServerUrl(serverUrl)}${user.avatarUrl.startsWith('/') ? '' : '/'}${user.avatarUrl}`;
}

/** Server URL of the signed-in session (null when signed out). */
export const sessionServerUrl = computed(() => _session.value?.serverUrl ?? null);

// ── Boot ──────────────────────────────────────────────────────────────────
export async function loadAuth(): Promise<void> {
	const kv = getDeviceRepositories().kv;
	const [session, guest, name] = await Promise.all([
		kv.get<StoredAuth>(AUTH_SESSION_KEY),
		kv.get<StoredAuth>(AUTH_GUEST_KEY),
		kv.get<string>(GUEST_NAME_KEY),
	]);
	_session.value = session ?? null;
	_guest.value = guest ?? null;
	_guestName.value = name ?? '';
	scheduleRefresh();
}

/** Test helper: clear in-memory state + timers (does not touch the db). */
export function resetAuthState(): void {
	if (refreshTimer) clearTimeout(refreshTimer);
	refreshTimer = null;
	refreshing = null;
	_session.value = null;
	_guest.value = null;
	_guestName.value = '';
	_busy.value = false;
	_error.value = null;
}

// The API layer reads the token from here and asks us to refresh on a 401.
setAuthTokenProvider(accessToken);
setUnauthorizedHandler(() => authActions.refresh());

defineStore({
	name: 'auth',
	init: loadAuth,
	dispose: () => {
		if (refreshTimer) clearTimeout(refreshTimer);
	},
});

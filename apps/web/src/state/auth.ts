// Auth store — owner/user login against the optional server + guest tokens for rooms.
//
// Read:   authUser, isLoggedIn, authBusy, authError, guestName, accessToken()
// Write:  authActions.login / logout / refresh / setGuestName
//         authActions.forgotPassword / resetPassword / changePassword / updateEmail / loadAccount
//           (reject with an Error whose message is user-facing; see accountErrorMessage)
//         authActions.ensureAccessToken()  → fresh user token (refreshes when < 60 s left)
//         authActions.roomToken()          → user token, else a guest token (rooms only)
//
// Tokens persist in the kv repository ('auth:session', 'auth:guest'). The access
// token is auto-refreshed REFRESH_LEAD_MS before expiry and on a 401 (via
// setUnauthorizedHandler in services/api). Auth calls go straight to the HTTP
// adapter for the configured server — never to the mock adapter.
import { computed, signal } from '@preact/signals';
import { PASSWORD_MIN_LENGTH, type AuthTokens, type UserDto } from '@chess/core/protocol';
import { getRepositories } from '@/services/db';
import { ApiRequestError, HttpApiAdapter, setAuthTokenProvider, setUnauthorizedHandler, type AccountApi } from '@/services/api';
import { serverConnector } from '@/services/server';
import { defineStore } from './registry';

export const AUTH_SESSION_KEY = 'auth:session';
export const AUTH_GUEST_KEY = 'auth:guest';
export const GUEST_NAME_KEY = 'auth:guestName';
/** Refresh this long before the access token expires. */
export const REFRESH_LEAD_MS = 60_000;

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
}

const defaultDeps: AuthDeps = {
	client: (url) => new HttpApiAdapter({ baseUrl: url }),
	account: (url, token) => new HttpApiAdapter({ baseUrl: url, getToken: () => token }),
	serverUrl: () => serverConnector.url.value,
	now: () => Date.now(),
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
		if (e.status === 0) return 'Server unreachable.';
		return e.message;
	}
	return e instanceof Error ? e.message : String(e);
}

type AccountAction = 'forgot' | 'reset' | 'change' | 'email' | 'load';

/** User-facing message for a failed password / account call. */
export function accountErrorMessage(action: AccountAction, e: unknown): string {
	if (e instanceof ApiRequestError) {
		if (e.status === 0) return e.code === 'unconfigured' ? 'Connect to a server first.' : 'Server unreachable.';
		if (e.status === 429) return 'Too many requests. Try again later.';
		if (e.status === 503 && action === 'forgot') return 'Password reset by email is not set up on this server.';
		if (e.status === 400 && action === 'reset') return 'This reset link is invalid, used or expired. Request a new one.';
		if (e.status === 401 && action === 'change') return 'The current password is wrong.';
		if (e.status === 401) return 'Session expired — sign in again.';
		if (e.status === 409 && action === 'email') return 'Another account already uses that email.';
		if (e.status === 400 && action === 'email') return 'Enter a valid email address.';
		if (e.status === 400 && action === 'change') return `The new password must have at least ${PASSWORD_MIN_LENGTH} characters.`;
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
	const kv = getRepositories().kv;
	if (next) await kv.set(AUTH_SESSION_KEY, next);
	else await kv.remove(AUTH_SESSION_KEY);
}

let refreshing: Promise<string | null> | null = null;

// ── Actions ───────────────────────────────────────────────────────────────
export const authActions = {
	async login(username: string, password: string): Promise<UserDto> {
		_busy.value = true;
		_error.value = null;
		try {
			const url = requireUrl();
			const tokens = await deps.client(url).login({ username: username.trim(), password });
			await setSession(toStored(tokens, url));
			return tokens.user;
		} catch (e) {
			_error.value = errorMessage(e);
			throw e;
		} finally {
			_busy.value = false;
		}
	},

	async logout(): Promise<void> {
		_error.value = null;
		await setSession(null);
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
		await getRepositories().kv.set(AUTH_GUEST_KEY, stored);
		return { token: stored.accessToken, user: stored.user };
	},

	async setGuestName(name: string): Promise<void> {
		_guestName.value = name.trim().slice(0, 40);
		await getRepositories().kv.set(GUEST_NAME_KEY, _guestName.value);
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
			_error.value = null;
			await setSession(toStored(tokens, url));
			return tokens.user;
		});
	},

	/** Signed in: change the password. The server signs out other sessions; this one gets new tokens. */
	async changePassword(currentPassword: string, newPassword: string): Promise<void> {
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
	const { id, username, displayName, role, email } = user;
	await setSession({ ...cur, user: { ...cur.user, id, username, displayName, role, email: email ?? null } });
}

// ── Boot ──────────────────────────────────────────────────────────────────
export async function loadAuth(): Promise<void> {
	const kv = getRepositories().kv;
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

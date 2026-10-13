import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthTokens, UserDto } from '@chess/core/protocol';
import { ApiRequestError, HttpApiAdapter } from '@/services/api';
import { setRepositories, type KvRepository, type Repositories } from '@/services/db';
import {
	AUTH_SESSION_KEY,
	REFRESH_LEAD_MS,
	authActions,
	authError,
	authUser,
	configureAuth,
	isLoggedIn,
	loadAuth,
	resetAuthState,
	type AuthApi,
	type StoredAuth,
} from '@/state/auth';
import { freshRepositories } from './testDb';

const URL_ = 'http://srv';
const owner: UserDto = { id: 'u1', username: 'owner', displayName: 'Owner', role: 'owner' };

function tokens(n: number, expiresIn = 900): AuthTokens {
	return { accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresIn, user: owner };
}

/** Map-backed kv (fake-indexeddb does not run under fake timers). */
function memoryKv(): KvRepository & { data: Map<string, unknown> } {
	const data = new Map<string, unknown>();
	return {
		data,
		get: async <T>(k: string) => data.get(k) as T | undefined,
		set: async <T>(k: string, v: T) => void data.set(k, v),
		remove: async (k: string) => void data.delete(k),
	};
}

describe('auth store', () => {
	let kv: ReturnType<typeof memoryKv>;
	let now: number;
	let client: { login: ReturnType<typeof vi.fn<AuthApi['login']>>; refresh: ReturnType<typeof vi.fn<AuthApi['refresh']>>; guest: ReturnType<typeof vi.fn<AuthApi['guest']>> };
	let issued: number;

	beforeEach(() => {
		const { repos } = freshRepositories();
		kv = memoryKv();
		setRepositories({ ...repos, kv } satisfies Repositories);
		resetAuthState();
		now = 1_000_000;
		issued = 0;
		client = {
			login: vi.fn(async () => tokens(++issued)),
			refresh: vi.fn(async () => tokens(++issued)),
			guest: vi.fn(async (req: { displayName: string }) => ({ accessToken: 'guest', expiresIn: 3600, user: { ...owner, id: 'g', role: 'guest' as const, displayName: req.displayName } })),
		};
		configureAuth({ client: () => client, serverUrl: () => URL_, now: () => now });
	});

	afterEach(() => {
		resetAuthState();
		configureAuth();
		vi.useRealTimers();
	});

	it('login stores tokens + user and persists the session', async () => {
		await authActions.login(' owner ', 'pw');
		expect(client.login).toHaveBeenCalledWith({ username: 'owner', password: 'pw' });
		expect(isLoggedIn.value).toBe(true);
		expect(authUser.value?.username).toBe('owner');
		const stored = kv.data.get(AUTH_SESSION_KEY) as StoredAuth;
		expect(stored).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: now + 900_000, serverUrl: URL_ });
	});

	it('login failure sets a readable error and stays signed out', async () => {
		client.login.mockRejectedValueOnce(new ApiRequestError('Unauthorized', 401, 'UNAUTHORIZED'));
		await expect(authActions.login('owner', 'bad')).rejects.toThrow();
		expect(isLoggedIn.value).toBe(false);
		expect(authError.value).toBe('Wrong username or password.');
	});

	it('ensureAccessToken returns the current token, and refreshes when < 60 s are left', async () => {
		await authActions.login('owner', 'pw');
		expect(await authActions.ensureAccessToken()).toBe('access-1');
		expect(client.refresh).not.toHaveBeenCalled();
		now += 900_000 - REFRESH_LEAD_MS + 1;
		expect(await authActions.ensureAccessToken()).toBe('access-2');
		expect(client.refresh).toHaveBeenCalledWith('refresh-1');
		expect((kv.data.get(AUTH_SESSION_KEY) as StoredAuth).accessToken).toBe('access-2');
	});

	it('concurrent refreshes share one request', async () => {
		await authActions.login('owner', 'pw');
		now += 900_000;
		const [a, b, c] = await Promise.all([authActions.ensureAccessToken(), authActions.ensureAccessToken(), authActions.refresh()]);
		expect([a, b, c]).toEqual(['access-2', 'access-2', 'access-2']);
		expect(client.refresh).toHaveBeenCalledTimes(1);
	});

	it('a rejected refresh token (401) signs out', async () => {
		await authActions.login('owner', 'pw');
		client.refresh.mockRejectedValueOnce(new ApiRequestError('expired', 401, 'UNAUTHORIZED'));
		expect(await authActions.refresh()).toBeNull();
		expect(isLoggedIn.value).toBe(false);
		expect(kv.data.has(AUTH_SESSION_KEY)).toBe(false);
		expect(authError.value).toMatch(/sign in again/i);
	});

	it('a network error during refresh keeps the session', async () => {
		await authActions.login('owner', 'pw');
		client.refresh.mockRejectedValueOnce(new ApiRequestError('Failed to fetch', 0, 'network'));
		expect(await authActions.refresh()).toBeNull();
		expect(isLoggedIn.value).toBe(true);
		expect(kv.data.has(AUTH_SESSION_KEY)).toBe(true);
		// Next attempt goes out again (no stale shared promise).
		expect(await authActions.refresh()).toBe('access-2');
	});

	it('refresh without a session resolves null and does not stick', async () => {
		expect(await authActions.refresh()).toBeNull();
		await authActions.login('owner', 'pw');
		expect(await authActions.refresh()).toBe('access-2');
	});

	it('logout during an in-flight refresh does not sign back in', async () => {
		await authActions.login('owner', 'pw');
		let release!: () => void;
		client.refresh.mockImplementationOnce(() => new Promise<AuthTokens>((r) => (release = () => r(tokens(99)))));
		const p = authActions.refresh();
		await authActions.logout();
		release();
		expect(await p).toBeNull();
		expect(isLoggedIn.value).toBe(false);
	});

	it('auto-refreshes 60 s before expiry and restores from kv on boot', async () => {
		vi.useFakeTimers();
		await authActions.login('owner', 'pw');
		resetAuthState();
		await loadAuth();
		expect(isLoggedIn.value).toBe(true);
		await vi.advanceTimersByTimeAsync(900_000 - REFRESH_LEAD_MS - 1);
		expect(client.refresh).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(2);
		expect(client.refresh).toHaveBeenCalledTimes(1);
	});

	it('roomToken uses the user token when signed in, else a cached guest token', async () => {
		await authActions.setGuestName('Kasparov');
		const g1 = await authActions.roomToken();
		expect(g1.user.displayName).toBe('Kasparov');
		await authActions.roomToken();
		expect(client.guest).toHaveBeenCalledTimes(1);
		await authActions.login('owner', 'pw');
		expect((await authActions.roomToken()).token).toBe('access-1');
	});
});

const ok = (data: unknown) => new Response(JSON.stringify({ data, timestamp: 'x' }), { status: 200 });
const unauthorized = () => new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'expired' } }), { status: 401 });

describe('HttpApiAdapter 401 retry', () => {
	it('refreshes once via onUnauthorized and retries with the new token', async () => {
		const seen: (string | null)[] = [];
		const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const headers = (init?.headers ?? {}) as Record<string, string>;
			const auth = headers.Authorization ?? null;
			seen.push(auth);
			return auth === 'Bearer fresh' ? ok({ savedGames: [], sessions: [], deletedSavedGameIds: [], deletedSessionIds: [], serverTime: 't' }) : unauthorized();
		}) as unknown as typeof fetch;
		const onUnauthorized = vi.fn(async () => 'fresh');
		const http = new HttpApiAdapter({ baseUrl: 'http://srv/', getToken: () => 'stale', onUnauthorized, fetchImpl });
		const res = await http.sync({ savedGames: [], sessions: [], deletedSavedGameIds: [], deletedSessionIds: [] });
		expect(res.serverTime).toBe('t');
		expect(seen).toEqual(['Bearer stale', 'Bearer fresh']);
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
	});

	it('gives up after one retry, and when the refresh yields no token', async () => {
		const fetchImpl = vi.fn(async () => unauthorized()) as unknown as typeof fetch;
		const onUnauthorized = vi.fn(async () => 'still-bad');
		const http = new HttpApiAdapter({ baseUrl: 'http://srv', getToken: () => 'stale', onUnauthorized, fetchImpl });
		await expect(http.me()).rejects.toMatchObject({ status: 401 });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(onUnauthorized).toHaveBeenCalledTimes(1);

		const none = new HttpApiAdapter({ baseUrl: 'http://srv', getToken: () => 'stale', onUnauthorized: async () => null, fetchImpl });
		await expect(none.me()).rejects.toMatchObject({ status: 401 });
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	it('does not call onUnauthorized when no token was sent', async () => {
		const fetchImpl = vi.fn(async () => unauthorized()) as unknown as typeof fetch;
		const onUnauthorized = vi.fn(async () => 'x');
		const http = new HttpApiAdapter({ baseUrl: 'http://srv', getToken: () => null, onUnauthorized, fetchImpl });
		await expect(http.login({ username: 'a', password: 'b' })).rejects.toMatchObject({ status: 401 });
		expect(onUnauthorized).not.toHaveBeenCalled();
	});
});

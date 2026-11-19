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
	setSessionListener,
	type AuthApi,
	type StoredAuth,
} from '@/state/auth';
import type { AccountApi } from '@/services/api';
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
		// Sign-out tells the server (best effort): a no-op fake keeps these tests off the network.
		configureAuth({ client: () => client, account: () => ({ logout: async () => undefined }) as unknown as AccountApi, serverUrl: () => URL_, now: () => now });
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

	describe('password + account', () => {
		let account: { [K in keyof AccountApi]: ReturnType<typeof vi.fn<AccountApi[K]>> };
		let tokensSeen: (string | null)[];

		beforeEach(() => {
			tokensSeen = [];
			account = {
				forgotPassword: vi.fn(async () => ({ sent: true })),
				resetPassword: vi.fn(async () => tokens(++issued)),
				changePassword: vi.fn(async () => tokens(++issued)),
				account: vi.fn(async () => ({ ...owner, email: 'me@x.org' })),
				updateAccount: vi.fn(async (req: { email?: string }) => ({ ...owner, email: req.email || null })),
				register: vi.fn(async (req) => ({ ...tokens(++issued), user: { ...owner, id: 'u2', username: req.username, displayName: req.displayName ?? req.username } })),
				oauthStart: vi.fn(async () => ({ url: 'https://accounts.google.test/o?x=1' })),
				oauthExchange: vi.fn(async () => ({ ...tokens(++issued), returnTo: '/games', created: true, linked: false })),
				identities: vi.fn(async () => [{ provider: 'google' as const, label: 'me@gmail.test', linkedAt: 1 }]),
				unlinkIdentity: vi.fn(async () => undefined),
				createInvite: vi.fn(async (req) => ({ code: 'c1', link: '/signup?invite=c1', email: req.email, createdAt: 1, acceptedAt: null })),
				invites: vi.fn(async () => []),
				invitePreview: vi.fn(async () => ({ inviter: { username: 'owner', displayName: 'Owner' }, email: 'f@x.org' })),
				verifyEmail: vi.fn(async () => ({ email: 'me@x.org' })),
				resendVerification: vi.fn(async () => undefined),
				sessions: vi.fn(async () => [{ id: 's1', label: 'Firefox on Linux', createdAt: 1, lastUsedAt: 2, current: true }]),
				revokeSession: vi.fn(async () => undefined),
				logout: vi.fn(async () => undefined),
				createRecoveryCodes: vi.fn(async () => ({ codes: ['aaaa-bbbb', 'cccc-dddd'] })),
				recoveryCodesLeft: vi.fn(async () => ({ remaining: 2 })),
				recoverPassword: vi.fn(async () => tokens(++issued)),
				uploadAvatar: vi.fn(async () => ({ ...owner, avatarUrl: '/users/u1/avatar?v=2' })),
				deleteAvatar: vi.fn(async () => ({ ...owner, avatarUrl: null })),
				deleteAccount: vi.fn(async () => undefined),
				ownerResetLink: vi.fn(async (u: string) => ({ link: `/reset-password?token=t-${u}`, expiresAt: 9 })),
			};
			configureAuth({ client: () => client, account: (_u, t) => (tokensSeen.push(t), account), serverUrl: () => URL_, now: () => now, navigate });
		});
		const navigate = vi.fn();

		it('register validates, lower-cases the username, omits empty fields and signs in', async () => {
			await expect(authActions.register({ username: 'x', password: 'long-enough' })).rejects.toThrow(/3–24/);
			await expect(authActions.register({ username: 'okname', password: 'short' })).rejects.toThrow(/at least 8/);
			await authActions.register({ username: ' NewUser ', password: 'long-enough', displayName: ' ', email: '', invite: 'abc' });
			expect(account.register).toHaveBeenCalledWith({ username: 'newuser', password: 'long-enough', invite: 'abc' });
			expect(authUser.value?.username).toBe('newuser');
			account.register.mockRejectedValueOnce(new ApiRequestError('username is taken', 409));
			await expect(authActions.register({ username: 'newuser', password: 'long-enough' })).rejects.toThrow('username is taken');
		});

		it('startOAuth sends absolute apiBase + origin and navigates; link mode sends the bearer', async () => {
			await authActions.startOAuth('google', 'signin', { returnTo: '/games' });
			expect(account.oauthStart).toHaveBeenCalledWith('google', expect.objectContaining({ mode: 'signin', apiBase: 'http://srv', returnTo: '/games' }));
			expect(navigate).toHaveBeenCalledWith('https://accounts.google.test/o?x=1');
			expect(tokensSeen.at(-1)).toBeNull();
			await expect(authActions.startOAuth('google', 'link')).rejects.toThrow('Sign in first.');
			await authActions.login('owner', 'pw');
			await authActions.startOAuth('google', 'link');
			expect(tokensSeen.at(-1)).toBe('access-1');
		});

		it('completeOAuth stores the tokens and reports created / returnTo', async () => {
			const r = await authActions.completeOAuth('code-1');
			expect(account.oauthExchange).toHaveBeenCalledWith('code-1');
			expect(r).toEqual({ returnTo: '/games', created: true, linked: false, provider: 'Google' });
			expect(isLoggedIn.value).toBe(true);
		});

		it('identities, unlink (409 = only sign-in), invites use the bearer token', async () => {
			await authActions.login('owner', 'pw');
			expect(await authActions.identities()).toHaveLength(1);
			account.unlinkIdentity.mockRejectedValueOnce(new ApiRequestError('Conflict', 409));
			await expect(authActions.unlinkIdentity('google')).rejects.toThrow(/only way to sign in/);
			await expect(authActions.createInvite('nope')).rejects.toThrow('Enter a valid email address.');
			const inv = await authActions.createInvite(' f@x.org ', '  ');
			expect(account.createInvite).toHaveBeenCalledWith({ email: 'f@x.org' });
			expect(inv.code).toBe('c1');
			expect((await authActions.invitePreview('c1')).inviter.displayName).toBe('Owner');
			expect(tokensSeen.at(-1)).toBeNull();
		});

		it('notifies the session listener on sign-in (with the previous session) and on sign-out', async () => {
			const signedIn = vi.fn(async () => false);
			const signedOut = vi.fn(async () => undefined);
			setSessionListener({ signedIn, signedOut });
			try {
				await authActions.login('owner', 'pw');
				expect(signedIn).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'access-1' }), null, expect.any(Object));
				await authActions.register({ username: 'second', password: 'long-enough' });
				expect(signedIn).toHaveBeenLastCalledWith(expect.objectContaining({ user: expect.objectContaining({ username: 'second' }) }), expect.objectContaining({ accessToken: 'access-1' }), expect.any(Object));
				await authActions.logout();
				expect(signedOut).toHaveBeenCalledTimes(1);
			} finally {
				setSessionListener(null);
			}
		});

		it('login 429 reads as rate limited', async () => {
			client.login.mockRejectedValueOnce(new ApiRequestError('Too Many Requests', 429));
			await expect(authActions.login('owner', 'pw')).rejects.toThrow();
			expect(authError.value).toBe('Too many sign-in attempts. Try again later.');
		});

		it('forgotPassword trims the identifier; maps 429 / 503 to readable errors', async () => {
			await authActions.forgotPassword('  me@x.org ');
			expect(account.forgotPassword).toHaveBeenCalledWith({ identifier: 'me@x.org' });
			await expect(authActions.forgotPassword('  ')).rejects.toThrow('Enter your username or email.');
			account.forgotPassword.mockRejectedValueOnce(new ApiRequestError('Too Many Requests', 429));
			await expect(authActions.forgotPassword('me')).rejects.toThrow('Too many requests. Try again later.');
			account.forgotPassword.mockRejectedValueOnce(new ApiRequestError('email is not configured', 503));
			await expect(authActions.forgotPassword('me')).rejects.toThrow('Password reset by email is not set up on this server.');
		});

		it('resetPassword signs in with the returned tokens; a bad link reads clearly', async () => {
			await expect(authActions.resetPassword('t', 'short')).rejects.toThrow(/at least 8/);
			await authActions.resetPassword('t', 'long-enough');
			expect(account.resetPassword).toHaveBeenCalledWith({ token: 't', password: 'long-enough' });
			expect(isLoggedIn.value).toBe(true);
			expect((kv.data.get(AUTH_SESSION_KEY) as StoredAuth).accessToken).toBe('access-1');
			account.resetPassword.mockRejectedValueOnce(new ApiRequestError('invalid', 400));
			await expect(authActions.resetPassword('t', 'long-enough')).rejects.toThrow(/invalid, used or expired/);
		});

		it('changePassword sends the bearer token and stores the new tokens; wrong current password reads clearly', async () => {
			await expect(authActions.changePassword('a', 'long-enough')).rejects.toThrow('Sign in first.');
			await authActions.login('owner', 'pw');
			await authActions.changePassword('pw', 'long-enough');
			expect(account.changePassword).toHaveBeenCalledWith({ currentPassword: 'pw', newPassword: 'long-enough' });
			expect(tokensSeen.at(-1)).toBe('access-1');
			expect(authUser.value).not.toBeNull();
			expect((kv.data.get(AUTH_SESSION_KEY) as StoredAuth).accessToken).toBe('access-2');
			account.changePassword.mockRejectedValueOnce(new ApiRequestError('Unauthorized', 401));
			await expect(authActions.changePassword('bad', 'long-enough')).rejects.toThrow('The current password is wrong.');
			expect(isLoggedIn.value).toBe(true);
		});

		it('logout ends the server session with the refresh token, and still signs out when that fails', async () => {
			await authActions.login('owner', 'pw');
			await authActions.logout();
			expect(account.logout).toHaveBeenCalledWith('refresh-1');
			expect(isLoggedIn.value).toBe(false);
			await authActions.login('owner', 'pw');
			account.logout.mockRejectedValueOnce(new ApiRequestError('offline', 0));
			await authActions.logout();
			expect(isLoggedIn.value).toBe(false);
		});

		it('verifyEmail marks the stored email verified; a bad link reads clearly', async () => {
			await authActions.login('owner', 'pw');
			await authActions.updateEmail('me@x.org');
			expect(await authActions.verifyEmail(' tok ')).toBe('me@x.org');
			expect(account.verifyEmail).toHaveBeenCalledWith('tok');
			expect(authUser.value?.emailVerified).toBe(true);
			await expect(authActions.verifyEmail('')).rejects.toThrow('no verification code');
			account.verifyEmail.mockRejectedValueOnce(new ApiRequestError('bad', 400));
			await expect(authActions.verifyEmail('x')).rejects.toThrow(/invalid, used or expired/);
			await authActions.resendVerification();
			expect(account.resendVerification).toHaveBeenCalled();
		});

		it('recovery codes: make (password checked), count left, reset with a code → signed in', async () => {
			await authActions.login('owner', 'pw');
			expect(await authActions.createRecoveryCodes('pw')).toEqual(['aaaa-bbbb', 'cccc-dddd']);
			expect(account.createRecoveryCodes).toHaveBeenCalledWith('pw');
			expect(await authActions.recoveryCodesLeft()).toBe(2);
			account.createRecoveryCodes.mockRejectedValueOnce(new ApiRequestError('Unauthorized', 401));
			await expect(authActions.createRecoveryCodes('bad')).rejects.toThrow('The password is wrong.');
			await authActions.logout();

			await expect(authActions.recoverPassword('owner', '', 'long-enough')).rejects.toThrow(/username and a recovery code/);
			await expect(authActions.recoverPassword('owner', 'c', 'short')).rejects.toThrow(/at least 8/);
			await authActions.recoverPassword(' owner ', ' aaaa-bbbb ', 'long-enough');
			expect(account.recoverPassword).toHaveBeenCalledWith({ username: 'owner', code: 'aaaa-bbbb', password: 'long-enough' });
			expect(isLoggedIn.value).toBe(true);
			account.recoverPassword.mockRejectedValueOnce(new ApiRequestError('Unauthorized', 401));
			await expect(authActions.recoverPassword('owner', 'used', 'long-enough')).rejects.toThrow(/Wrong username or recovery code/);
		});

		it('devices, avatar, owner reset link and display name go through the signed-in account', async () => {
			await authActions.login('owner', 'pw');
			expect(await authActions.sessions()).toHaveLength(1);
			await authActions.revokeSession('s2');
			expect(account.revokeSession).toHaveBeenCalledWith('s2');
			const blob = new Blob(['x'], { type: 'image/webp' });
			expect((await authActions.uploadAvatar(blob)).avatarUrl).toBe('/users/u1/avatar?v=2');
			expect(account.uploadAvatar).toHaveBeenCalledWith(blob);
			expect(authUser.value?.avatarUrl).toBe('/users/u1/avatar?v=2');
			await authActions.deleteAvatar();
			expect(authUser.value?.avatarUrl).toBeNull();
			account.uploadAvatar.mockRejectedValueOnce(new ApiRequestError('too big', 413));
			await expect(authActions.uploadAvatar(blob)).rejects.toThrow(/PNG, JPEG or WebP/);
			expect((await authActions.ownerResetLink(' pal ')).link).toBe('/reset-password?token=t-pal');
			account.ownerResetLink.mockRejectedValueOnce(new ApiRequestError('nope', 404));
			await expect(authActions.ownerResetLink('ghost')).rejects.toThrow('No user with that username.');
			await expect(authActions.updateDisplayName('  ')).rejects.toThrow('1–64');
			await authActions.updateDisplayName(' Boss ');
			expect(account.updateAccount).toHaveBeenCalledWith({ displayName: 'Boss' });
		});

		it('deleteAccount sends the password, signs out and tells the account layer', async () => {
			const deleted = vi.fn(async () => undefined);
			setSessionListener({ signedIn: async () => false, signedOut: async () => undefined, deleted });
			try {
				await authActions.login('owner', 'pw');
				account.deleteAccount.mockRejectedValueOnce(new ApiRequestError('Unauthorized', 401));
				await expect(authActions.deleteAccount('bad')).rejects.toThrow('The password is wrong.');
				expect(isLoggedIn.value).toBe(true);
				await authActions.deleteAccount('pw');
				expect(account.deleteAccount).toHaveBeenCalledWith({ password: 'pw' });
				expect(isLoggedIn.value).toBe(false);
				expect(deleted).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: 'u1' }) }));
			} finally {
				setSessionListener(null);
			}
		});

		it('completeOAuth names the provider the sign-in started with', async () => {
			await authActions.startOAuth('lichess', 'signin');
			expect(account.oauthStart).toHaveBeenCalledWith('lichess', expect.objectContaining({ mode: 'signin' }));
			const r = await authActions.completeOAuth('code-2');
			expect(r.provider).toBe('Lichess');
			expect((await authActions.completeOAuth('code-3')).provider).toBe('Google');
		});

		it('updateEmail / loadAccount patch the stored user; 409 reads clearly', async () => {
			await authActions.login('owner', 'pw');
			await authActions.updateEmail(' new@x.org ');
			expect(account.updateAccount).toHaveBeenCalledWith({ email: 'new@x.org' });
			expect(authUser.value?.email).toBe('new@x.org');
			expect((kv.data.get(AUTH_SESSION_KEY) as StoredAuth).user.email).toBe('new@x.org');
			await authActions.updateEmail('');
			expect(authUser.value?.email).toBeNull();
			await authActions.loadAccount();
			expect(authUser.value?.email).toBe('me@x.org');
			account.updateAccount.mockRejectedValueOnce(new ApiRequestError('Conflict', 409));
			await expect(authActions.updateEmail('taken@x.org')).rejects.toThrow('Another account already uses that email.');
		});
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

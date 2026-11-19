import { describe, expect, it, vi } from 'vitest';
import { HttpApiAdapter } from './HttpApiAdapter';
import { MockApiAdapter } from './MockApiAdapter';
import { ApiRequestError } from './ApiClient';

describe('HttpApiAdapter', () => {
	it('unwraps { data } and sends the bearer token', async () => {
		const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'sf-native' }], timestamp: 't' }), { status: 200 })) as unknown as typeof fetch;
		const api = new HttpApiAdapter({ baseUrl: 'http://srv/', getToken: () => 'tok', fetchImpl });
		const engines = await api.engines();
		expect(engines[0]!.id).toBe('sf-native');
		const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://srv/engines');
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
	});

	it('password + account endpoints: paths, methods and bodies', async () => {
		const calls: { url: string; method: string; body?: unknown }[] = [];
		const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
			calls.push({ url, method: init.method!, body: init.body ? JSON.parse(init.body as string) : undefined });
			return new Response(JSON.stringify({ data: { ok: 1 } }), { status: 200 });
		}) as unknown as typeof fetch;
		const api = new HttpApiAdapter({ baseUrl: 'http://srv', getToken: () => 'tok', fetchImpl });
		await api.forgotPassword({ identifier: 'me@x.org' });
		await api.resetPassword({ token: 't1', password: 'new-pass-1' });
		await api.changePassword({ currentPassword: 'a', newPassword: 'b' });
		await api.account();
		await api.updateAccount({ email: '' });
		expect(calls).toEqual([
			{ url: 'http://srv/auth/password/forgot', method: 'POST', body: { identifier: 'me@x.org' } },
			{ url: 'http://srv/auth/password/reset', method: 'POST', body: { token: 't1', password: 'new-pass-1' } },
			{ url: 'http://srv/auth/password/change', method: 'POST', body: { currentPassword: 'a', newPassword: 'b' } },
			{ url: 'http://srv/users/me', method: 'GET', body: undefined },
			{ url: 'http://srv/users/me', method: 'PATCH', body: { email: '' } },
		]);
	});

	it('accounts endpoints: register, OAuth, identities, invites', async () => {
		const calls: { url: string; method: string; auth?: string; body?: unknown }[] = [];
		const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
			calls.push({ url, method: init.method!, auth: (init.headers as Record<string, string>).Authorization, body: init.body ? JSON.parse(init.body as string) : undefined });
			return new Response(JSON.stringify({ data: {} }), { status: 200 });
		}) as unknown as typeof fetch;
		const api = new HttpApiAdapter({ baseUrl: 'http://srv/api/', getToken: () => 'tok', fetchImpl });
		await api.register({ username: 'u', password: 'p' });
		await api.oauthStart('google', { mode: 'signin', appOrigin: 'http://app', apiBase: 'http://srv/api' });
		await api.oauthExchange('c');
		await api.identities();
		await api.unlinkIdentity('google');
		await api.createInvite({ email: 'f@x.org' });
		await api.invites();
		await api.invitePreview('a b');
		expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
			'POST http://srv/api/auth/register',
			'POST http://srv/api/auth/oauth/google/start',
			'POST http://srv/api/auth/oauth/exchange',
			'GET http://srv/api/users/me/identities',
			'DELETE http://srv/api/users/me/identities/google',
			'POST http://srv/api/invites',
			'GET http://srv/api/invites',
			'GET http://srv/api/invites/a%20b',
		]);
		expect(calls[2]!.body).toEqual({ code: 'c' });
		expect(calls[1]!.body).toMatchObject({ mode: 'signin', apiBase: 'http://srv/api' });
	});

	it('profile endpoints: verify, devices, logout, recovery codes, avatar (multipart), delete, owner link', async () => {
		const calls: { url: string; method: string; auth?: string; contentType?: string; body?: BodyInit | null }[] = [];
		const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
			const h = init.headers as Record<string, string>;
			calls.push({ url, method: init.method!, auth: h.Authorization, contentType: h['Content-Type'], body: init.body });
			return new Response(JSON.stringify({ data: {} }), { status: 200 });
		}) as unknown as typeof fetch;
		const api = new HttpApiAdapter({ baseUrl: 'http://srv/api', getToken: () => 'tok', fetchImpl });
		await api.verifyEmail('t1');
		await api.resendVerification();
		await api.sessions();
		await api.revokeSession('s 1');
		await api.logout('r1');
		await api.createRecoveryCodes('pw');
		await api.recoveryCodesLeft();
		await api.recoverPassword({ username: 'u', code: 'c', password: 'p' });
		await api.uploadAvatar(new Blob(['x'], { type: 'image/webp' }));
		await api.deleteAvatar();
		await api.deleteAccount({ password: 'pw' });
		await api.ownerResetLink('pal');
		expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
			'POST http://srv/api/auth/email/verify',
			'POST http://srv/api/users/me/email/verify',
			'GET http://srv/api/users/me/sessions',
			'DELETE http://srv/api/users/me/sessions/s%201',
			'POST http://srv/api/auth/logout',
			'POST http://srv/api/users/me/recovery-codes',
			'GET http://srv/api/users/me/recovery-codes',
			'POST http://srv/api/auth/password/recover',
			'PUT http://srv/api/users/me/avatar',
			'DELETE http://srv/api/users/me/avatar',
			'DELETE http://srv/api/users/me',
			'POST http://srv/api/admin/users/pal/reset-link',
		]);
		expect(JSON.parse(calls[0]!.body as string)).toEqual({ token: 't1' });
		expect(JSON.parse(calls[4]!.body as string)).toEqual({ refreshToken: 'r1' });
		expect(JSON.parse(calls[10]!.body as string)).toEqual({ password: 'pw' });
		// Avatar: multipart (no JSON content type; the browser sets the boundary), field `file`.
		const upload = calls[8]!;
		expect(upload.contentType).toBeUndefined();
		expect(upload.body).toBeInstanceOf(FormData);
		const file = (upload.body as FormData).get('file') as File;
		expect(file.name).toBe('avatar.webp');
		expect(upload.auth).toBe('Bearer tok');
	});

	it('maps { error } bodies to ApiRequestError', async () => {
		const fetchImpl = vi.fn(
			async () => new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Nope', timestamp: 't', path: '/auth/me' } }), { status: 401 }),
		) as unknown as typeof fetch;
		const api = new HttpApiAdapter({ baseUrl: 'http://srv', fetchImpl });
		await expect(api.me()).rejects.toMatchObject({ status: 401, code: 'unauthorized', message: 'Nope' });
		await expect(api.me()).rejects.toBeInstanceOf(ApiRequestError);
	});
});

describe('MockApiAdapter', () => {
	it('serves fixtures for every server-only call', async () => {
		const mock = new MockApiAdapter(0);
		expect((await mock.health()).status).toBe('ok');
		expect((await mock.engines()).length).toBeGreaterThan(0);
		const ex = await mock.explorer('fen-x', 'masters');
		expect(ex).toMatchObject({ fen: 'fen-x', source: 'masters' });
		expect((await mock.login({ username: 'me', password: 'x' })).user.username).toBe('me');
		expect(await mock.forgotPassword({ identifier: 'me' })).toEqual({ sent: true });
		expect((await mock.updateAccount({ email: 'a@b.c' })).email).toBe('a@b.c');
		expect((await mock.updateAccount({ email: '' })).email).toBeNull();
	});
});

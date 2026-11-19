import request from 'supertest';
import { bootApp, TestApp } from '../helpers/app';
import { Mailer, MemoryMailer } from '../../src/modules/mail';

// Fake Google: the token + userinfo endpoints answer from `googleUser`; everything else uses real fetch.
let googleUser: { sub: string; email?: string; email_verified?: boolean; name?: string } = { sub: 'g-1' };
const realFetch = global.fetch;
global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
	const url = String(input);
	if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'ga' }), { status: 200 });
	if (url.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) return new Response(JSON.stringify(googleUser), { status: 200 });
	return realFetch(input, init);
}) as typeof fetch;

const APP = 'http://localhost:5173';

describe('accounts: sign-up, login limits, invites, Google', () => {
	let t: TestApp;
	let outbox: MemoryMailer['outbox'];
	const http = () => request(t.app.getHttpServer());
	const register = (body: Record<string, unknown>) => http().post('/auth/register').send(body);
	const bearer = (tok: string) => ({ Authorization: `Bearer ${tok}` });

	/** Runs the browser part of the Google flow and returns the app redirect target. */
	async function google(mode: 'signin' | 'link', token?: string, invite?: string): Promise<string> {
		const req = http().post('/auth/oauth/google/start');
		if (token) req.set(bearer(token));
		const start = await req.send({ mode, appOrigin: APP, apiBase: t.url, returnTo: '/games', ...(invite ? { invite } : {}) });
		expect(start.status).toBe(200);
		const url = new URL(start.body.data.url);
		expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
		expect(url.searchParams.get('redirect_uri')).toBe(`${t.url}/auth/google/callback`);
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
		const cb = await http().get(`/auth/google/callback?code=c&state=${url.searchParams.get('state')}`);
		expect(cb.status).toBe(302);
		return cb.headers.location as string;
	}
	const exchange = async (location: string) => {
		const code = new URLSearchParams(location.split('#')[1]).get('code');
		return http().post('/auth/oauth/exchange').send({ code });
	};

	beforeAll(async () => {
		t = await bootApp({ MAIL_PROVIDER: 'memory', APP_PUBLIC_URL: APP, GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', LOGIN_MAX_PER_USER: '3', REGISTER_MAX_PER_IP: '20' });
		outbox = (t.app.get(Mailer) as MemoryMailer).outbox;
	});
	afterAll(async () => {
		global.fetch = realFetch;
		await t.close();
	});

	it('health advertises sign-up and providers', async () => {
		const { body } = await http().get('/health');
		expect(body.data.features).toMatchObject({ signup: 'open', oauth: ['google', 'lichess'], passwordReset: true });
	});

	it('registers, validates, and refuses taken names and emails', async () => {
		const ok = await register({ username: 'Alice_1', password: 'alice-pass-1', displayName: 'Alice', email: 'Alice@Example.test' });
		expect(ok.status).toBe(201);
		expect(ok.body.data.user).toMatchObject({ username: 'alice_1', displayName: 'Alice', role: 'user', email: 'alice@example.test', hasPassword: true });
		expect((await register({ username: 'alice_1', password: 'another-pass' })).status).toBe(409);
		expect((await register({ username: 'bob', password: 'bob-pass-12', email: 'alice@example.test' })).status).toBe(409);
		expect((await register({ username: 'no', password: 'longenough' })).status).toBe(400);
		expect((await register({ username: 'admin', password: 'longenough' })).status).toBe(400);
		expect((await register({ username: 'carol', password: 'short' })).status).toBe(400);
		// Sign in by email too.
		expect((await http().post('/auth/login').send({ username: 'alice@example.test', password: 'alice-pass-1' })).status).toBe(200);
	});

	it('limits failed logins per username (429), success resets the counter', async () => {
		expect((await register({ username: 'locky', password: 'locky-pass-1' })).status).toBe(201);
		const login = (password: string) => http().post('/auth/login').send({ username: 'locky', password });
		expect((await login('wrong-pass')).status).toBe(401);
		expect((await login('locky-pass-1')).status).toBe(200); // success resets the count
		const codes: number[] = [];
		for (let i = 0; i < 4; i++) codes.push((await login('wrong-pass')).status);
		expect(codes).toEqual([401, 401, 401, 429]);
		// Locked for the window, even with the right password.
		expect((await login('locky-pass-1')).status).toBe(429);
	});

	it('invites: email with link, public preview, sign-up accepts it once', async () => {
		const owner = (await http().post('/auth/login').send({ username: 'owner', password: 'owner-pass' })).body.data.accessToken;
		const inv = await http().post('/invites').set(bearer(owner)).send({ email: 'friend@example.test', message: 'Come <play>!' });
		expect(inv.status).toBe(201);
		expect(inv.body.data.link).toBe(`${APP}/signup?invite=${inv.body.data.code}`);
		await new Promise((r) => setTimeout(r, 50));
		const mail = outbox.find((m) => m.to === 'friend@example.test')!;
		expect(mail.subject).toBe('owner invites you to Chess Trainer');
		expect(mail.html).toContain('Come &lt;play&gt;!');
		expect(mail.text).toContain(inv.body.data.link);

		const preview = await http().get(`/invites/${inv.body.data.code}`);
		expect(preview.body.data).toEqual({ inviter: { username: 'owner', displayName: 'owner' }, email: 'friend@example.test' });
		expect((await register({ username: 'friend', password: 'friend-pass', invite: inv.body.data.code })).status).toBe(201);
		expect((await http().get(`/invites/${inv.body.data.code}`)).status).toBe(404);
		// A brand-new account cannot send invites yet (spam guard).
		const friend = (await http().post('/auth/login').send({ username: 'friend', password: 'friend-pass' })).body.data.accessToken;
		expect((await http().post('/invites').set(bearer(friend)).send({ email: 'x@example.test' })).status).toBe(403);
		const mine = await http().get('/invites').set(bearer(owner));
		expect(mine.body.data[0]).toMatchObject({ email: 'friend@example.test', acceptedAt: expect.any(Number) });
	});

	it('Google: creates an account, signs in again, refuses an email that belongs to another account', async () => {
		googleUser = { sub: 'g-new', email: 'newbie@example.test', email_verified: true, name: 'New Bie' };
		const loc = await google('signin');
		expect(loc.startsWith(`${APP}/auth/callback#code=`)).toBe(true);
		const first = await exchange(loc);
		expect(first.body.data).toMatchObject({ created: true, linked: false, returnTo: '/games', user: { username: 'newbie', displayName: 'New Bie', email: 'newbie@example.test', hasPassword: false } });
		// The code is single use.
		expect((await exchange(loc)).status).toBe(400);
		const again = await exchange(await google('signin'));
		expect(again.body.data).toMatchObject({ created: false, user: { username: 'newbie' } });

		// Passwordless account: unlinking the only sign-in is refused; setting a password needs no current one.
		const tok = again.body.data.accessToken;
		expect((await http().delete('/users/me/identities/google').set(bearer(tok))).status).toBe(409);
		expect((await http().post('/auth/password/change').set(bearer(tok)).send({ currentPassword: '', newPassword: 'newbie-pass' })).status).toBe(200);

		// Alice's email is still unconfirmed: a Google-verified owner of the address takes it over.
		// Once confirmed, it blocks a new Google account with the same email.
		const verify = outbox.find((m) => m.to === 'alice@example.test' && m.tag === 'verify-email')!;
		const vt = decodeURIComponent(/verify-email\?token=([^\s"&]+)/.exec(verify.text)![1]!);
		expect((await http().post('/auth/email/verify').send({ token: vt })).status).toBe(200);
		googleUser = { sub: 'g-other', email: 'alice@example.test', email_verified: true, name: 'Not Alice' };
		const conflict = await google('signin');
		expect(decodeURIComponent(conflict)).toContain('#error=An account with alice@example.test already exists');

		googleUser = { sub: 'g-squat', email: 'squatted@example.test', email_verified: true, name: 'Real Owner' };
		expect((await register({ username: 'squatter', password: 'squat-pass-1', email: 'squatted@example.test' })).status).toBe(201);
		const taken = await exchange(await google('signin'));
		expect(taken.body.data).toMatchObject({ created: true, user: { email: 'squatted@example.test', emailVerified: true } });
	});

	it('Google: links to the signed-in account, lists and unlinks', async () => {
		const alice = (await http().post('/auth/login').send({ username: 'alice_1', password: 'alice-pass-1' })).body.data.accessToken;
		googleUser = { sub: 'g-alice', email: 'alice@example.test', email_verified: true, name: 'Alice G' };
		const res = await exchange(await google('link', alice));
		expect(res.body.data).toMatchObject({ linked: true, user: { username: 'alice_1' } });
		const ids = await http().get('/users/me/identities').set(bearer(alice));
		expect(ids.body.data).toEqual([{ provider: 'google', label: 'alice@example.test', linkedAt: expect.any(Number) }]);
		// Now Google signs Alice in.
		expect((await exchange(await google('signin'))).body.data.user.username).toBe('alice_1');
		expect((await http().delete('/users/me/identities/google').set(bearer(alice))).status).toBe(204);
		// link mode without a token is refused; foreign origins are refused.
		expect((await http().post('/auth/oauth/google/start').send({ mode: 'link', appOrigin: APP, apiBase: t.url })).status).toBe(401);
		expect((await http().post('/auth/oauth/google/start').send({ mode: 'signin', appOrigin: 'https://evil.test', apiBase: t.url })).status).toBe(400);
		expect((await http().get('/auth/google/callback?code=x&state=unknown')).status).toBe(400);
	});
});

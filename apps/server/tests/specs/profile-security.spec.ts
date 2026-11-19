import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { bootApp, TestApp } from '../helpers/app';
import { Mailer, MemoryMailer } from '../../src/modules/mail';

// Fake Lichess OAuth endpoints; everything else uses real fetch.
const realFetch = global.fetch;
global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
	const url = String(input);
	if (url === 'https://lichess.org/api/token') return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ access_token: 'lt' }), { status: 200 });
	if (url === 'https://lichess.org/api/account') return new Response(JSON.stringify({ id: 'drnykterstein', username: 'DrNykterstein' }), { status: 200 });
	return realFetch(input, init);
}) as typeof fetch;

const APP = 'http://localhost:5173';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('profile security: email verification, devices, recovery codes, avatar, delete, owner link, Lichess', () => {
	let t: TestApp;
	let outbox: MemoryMailer['outbox'];
	const http = () => request(t.app.getHttpServer());
	const bearer = (tok: string) => ({ Authorization: `Bearer ${tok}` });
	const tokenIn = (text: string, path: string) => decodeURIComponent(new RegExp(`${path}\\?token=([^\\s"&]+)`).exec(text)![1]!);
	const login = (username: string, password: string, ua = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0') =>
		http().post('/auth/login').set('User-Agent', ua).send({ username, password });
	const mailTo = async (to: string, subject: RegExp) => {
		for (let i = 0; i < 40; i++) {
			const m = [...outbox].reverse().find((x) => x.to === to && subject.test(x.subject));
			if (m) return m;
			await sleep(25);
		}
		throw new Error(`no mail to ${to} ${subject}`);
	};

	beforeAll(async () => {
		t = await bootApp({ MAIL_PROVIDER: 'memory', APP_PUBLIC_URL: APP, AVATAR_DIR: mkdtempSync(join(tmpdir(), 'avatars-')), REGISTER_MAX_PER_IP: '50' });
		outbox = (t.app.get(Mailer) as MemoryMailer).outbox;
	});
	afterAll(async () => {
		global.fetch = realFetch;
		await t.close();
	});

	it('email verification gates reset links; changing the email needs a new confirmation', async () => {
		const reg = await http().post('/auth/register').send({ username: 'vera', password: 'vera-pass-1', email: 'vera@example.test' });
		expect(reg.body.data.user).toMatchObject({ email: 'vera@example.test', emailVerified: false });
		const tok = reg.body.data.accessToken;
		const first = await mailTo('vera@example.test', /Confirm your email/);

		// Unconfirmed → no reset email.
		await http().post('/auth/password/forgot').send({ identifier: 'vera' });
		await sleep(80);
		expect(outbox.some((m) => m.to === 'vera@example.test' && /Reset/.test(m.subject))).toBe(false);

		expect((await http().post('/users/me/email/verify').set(bearer(tok))).status).toBe(202);
		expect((await http().post('/auth/email/verify').send({ token: tokenIn(first.text, 'verify-email') })).body.data).toEqual({ email: 'vera@example.test' });
		expect((await http().get('/users/me').set(bearer(tok))).body.data.emailVerified).toBe(true);
		await http().post('/auth/password/forgot').send({ identifier: 'vera@example.test' });
		await mailTo('vera@example.test', /Reset your/);

		// New address → unverified again; a link for the old one no longer applies.
		const patched = await http().patch('/users/me').set(bearer(tok)).send({ email: 'vera2@example.test' });
		expect(patched.body.data).toMatchObject({ email: 'vera2@example.test', emailVerified: false });
		await mailTo('vera2@example.test', /Confirm your email/);
		expect((await http().post('/auth/email/verify').send({ token: 'x'.repeat(30) })).status).toBe(400);
	});

	it('devices: list, rotation, reuse detection, sign out a device, logout', async () => {
		await http().post('/auth/register').send({ username: 'dev', password: 'dev-pass-12' });
		const a = (await login('dev', 'dev-pass-12', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36')).body.data;
		const b = (await login('dev', 'dev-pass-12', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1')).body.data;
		const list = (await http().get('/users/me/sessions').set(bearer(a.accessToken))).body.data;
		// Sign-up (no user agent in tests) + two sign-ins.
		expect(list.map((d: { label: string }) => d.label).sort()).toEqual(['Chrome on Windows', 'Safari on iPhone', 'Unknown device']);
		expect(list.filter((d: { current: boolean }) => d.current)).toHaveLength(1);

		// Rotation: r1 → r2 → r3; replaying r1 later = theft → session ends.
		const r2 = (await http().post('/auth/refresh').send({ refreshToken: a.refreshToken })).body.data;
		const r3 = (await http().post('/auth/refresh').send({ refreshToken: r2.refreshToken })).body.data;
		expect(typeof r3.refreshToken).toBe('string');
		expect((await http().post('/auth/refresh').send({ refreshToken: a.refreshToken })).status).toBe(401);
		expect((await http().post('/auth/refresh').send({ refreshToken: r3.refreshToken })).status).toBe(401);

		// Device B signs device… B out from B's own list; then logout of a fresh session.
		const bSid = (await http().get('/users/me/sessions').set(bearer(b.accessToken))).body.data.find((d: { current: boolean }) => d.current).id;
		const c = (await login('dev', 'dev-pass-12')).body.data;
		expect((await http().delete(`/users/me/sessions/${bSid}`).set(bearer(c.accessToken))).status).toBe(204);
		expect((await http().post('/auth/refresh').send({ refreshToken: b.refreshToken })).status).toBe(401);
		expect((await http().post('/auth/logout').send({ refreshToken: c.refreshToken })).status).toBe(204);
		expect((await http().post('/auth/refresh').send({ refreshToken: c.refreshToken })).status).toBe(401);
	});

	it('password change keeps this device and signs out the others', async () => {
		await http().post('/auth/register').send({ username: 'chg', password: 'chg-pass-12' });
		const here = (await login('chg', 'chg-pass-12')).body.data;
		const other = (await login('chg', 'chg-pass-12')).body.data;
		await sleep(1100);
		const changed = await http().post('/auth/password/change').set(bearer(here.accessToken)).send({ currentPassword: 'chg-pass-12', newPassword: 'chg-pass-34' });
		expect(changed.status).toBe(200);
		expect((await http().post('/auth/refresh').send({ refreshToken: changed.body.data.refreshToken })).status).toBe(200);
		expect((await http().post('/auth/refresh').send({ refreshToken: other.refreshToken })).status).toBe(401);
	});

	it('recovery codes: generate, recover once, count', async () => {
		const tok = (await http().post('/auth/register').send({ username: 'rec', password: 'rec-pass-12' })).body.data.accessToken;
		expect((await http().post('/users/me/recovery-codes').set(bearer(tok)).send({ currentPassword: 'wrong' })).status).toBe(401);
		const { codes } = (await http().post('/users/me/recovery-codes').set(bearer(tok)).send({ currentPassword: 'rec-pass-12' })).body.data;
		expect(codes).toHaveLength(8);
		expect(codes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
		expect((await http().post('/auth/password/recover').send({ username: 'rec', code: 'aaaa-aaaa', password: 'new-pass-99' })).status).toBe(400);
		const ok = await http().post('/auth/password/recover').send({ username: 'REC', code: codes[2].toUpperCase().replace('-', ''), password: 'new-pass-99' });
		expect(ok.status).toBe(200);
		expect((await http().post('/auth/password/recover').send({ username: 'rec', code: codes[2], password: 'new-pass-00' })).status).toBe(400);
		expect((await http().get('/users/me/recovery-codes').set(bearer(ok.body.data.accessToken))).body.data).toEqual({ remaining: 7 });
		expect((await login('rec', 'new-pass-99')).status).toBe(200);
	});

	it('avatar: upload by magic bytes, serve, reject non-images, remove', async () => {
		const reg = (await http().post('/auth/register').send({ username: 'ava', password: 'ava-pass-12' })).body.data;
		const tok = reg.accessToken;
		expect((await http().put('/users/me/avatar').set(bearer(tok)).attach('file', Buffer.from('not an image'), 'x.png')).status).toBe(400);
		const up = await http().put('/users/me/avatar').set(bearer(tok)).attach('file', PNG, 'a.png');
		expect(up.status).toBe(200);
		expect(up.body.data.avatarUrl).toBe(`/users/${reg.user.id}/avatar?v=1`);
		const img = await http().get(up.body.data.avatarUrl);
		expect(img.status).toBe(200);
		expect(img.headers['content-type']).toBe('image/png');
		expect(img.headers['cache-control']).toContain('immutable');
		expect(Buffer.compare(img.body as Buffer, PNG)).toBe(0);
		expect((await http().put('/users/me/avatar').set(bearer(tok)).attach('file', Buffer.alloc(400 * 1024, 1), 'big.png')).status).toBe(413);
		expect((await http().delete('/users/me/avatar').set(bearer(tok))).body.data.avatarUrl).toBeNull();
		expect((await http().get(`/users/${reg.user.id}/avatar`)).status).toBe(404);
	});

	it('delete account (password), owner protected; owner reset link', async () => {
		const tok = (await http().post('/auth/register').send({ username: 'gone', password: 'gone-pass-1' })).body.data.accessToken;
		expect((await http().delete('/users/me').set(bearer(tok)).send({ password: 'nope' })).status).toBe(401);
		expect((await http().post('/admin/users/gone/reset-link').set(bearer(tok))).status).toBe(403);
		const owner = (await login('owner', 'owner-pass')).body.data.accessToken;
		const link = (await http().post('/admin/users/gone/reset-link').set(bearer(owner))).body.data;
		expect(link.link).toContain(`${APP}/reset-password?token=`);
		expect((await http().post('/auth/password/reset').send({ token: tokenIn(link.link, 'reset-password'), password: 'gone-pass-2' })).status).toBe(200);
		const tok2 = (await login('gone', 'gone-pass-2')).body.data.accessToken;
		expect((await http().delete('/users/me').set(bearer(tok2)).send({ password: 'gone-pass-2' })).status).toBe(204);
		expect((await login('gone', 'gone-pass-2')).status).toBe(401);
		expect((await http().delete('/users/me').set(bearer(owner)).send({ password: 'owner-pass' })).status).toBe(403);
	});

	it('Lichess: sign in creates an account named after the Lichess user', async () => {
		const start = await http().post('/auth/oauth/lichess/start').send({ mode: 'signin', appOrigin: APP, apiBase: t.url });
		const url = new URL(start.body.data.url);
		expect(url.origin + url.pathname).toBe('https://lichess.org/oauth');
		expect(url.searchParams.get('client_id')).toBe('localhost:5173');
		const cb = await http().get(`/auth/lichess/callback?code=c&state=${url.searchParams.get('state')}`);
		const code = new URLSearchParams((cb.headers.location as string).split('#')[1]).get('code');
		const res = (await http().post('/auth/oauth/exchange').send({ code })).body.data;
		expect(res).toMatchObject({ created: true, user: { username: 'drnykterstein', displayName: 'DrNykterstein', hasPassword: false } });
		const ids = (await http().get('/users/me/identities').set(bearer(res.accessToken))).body.data;
		expect(ids).toEqual([{ provider: 'lichess', label: 'DrNykterstein', linkedAt: expect.any(Number) }]);
	});
});

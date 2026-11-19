import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { bootApp, TestApp } from '../helpers/app';
import { createMailer, DisabledMailer, MemoryMailer, Mailer, ResendMailer, passwordResetMail } from '../../src/modules/mail';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('password reset (email) + change', () => {
	let t: TestApp;
	let outbox: MemoryMailer['outbox'];
	const http = () => request(t.app.getHttpServer());
	const login = (password: string) => http().post('/auth/login').send({ username: 'owner', password });
	const forgot = (identifier: string) => http().post('/auth/password/forgot').send({ identifier });
	const tokenFrom = (text: string) => decodeURIComponent(/reset-password\?token=([^\s"&]+)/.exec(text)![1]!);

	beforeAll(async () => {
		t = await bootApp({ MAIL_PROVIDER: 'memory', APP_PUBLIC_URL: 'https://chess.example.test/' });
		const mailer = t.app.get(Mailer);
		expect(mailer).toBeInstanceOf(MemoryMailer);
		outbox = (mailer as MemoryMailer).outbox;
	});
	afterAll(() => t.close());

	it('answers 202 and sends nothing for unknown accounts or accounts without an email', async () => {
		expect((await forgot('nobody')).status).toBe(202);
		expect((await forgot('owner')).body.data).toEqual({ sent: true });
		await sleep(50);
		expect(outbox).toHaveLength(0);
	});

	it('emails a single-use link; reset signs in and ends older sessions; change needs the current password', async () => {
		const first = (await login('owner-pass')).body.data;
		const set = await http().patch('/users/me').set('Authorization', `Bearer ${first.accessToken}`).send({ email: 'Owner@Example.test' });
		expect(set.status).toBe(200);
		expect(set.body.data).toMatchObject({ email: 'owner@example.test', emailVerified: false });
		// Confirm the address first: reset links go to confirmed emails only.
		await vi(() => outbox.length === 1);
		const verify = outbox.shift()!;
		expect(verify.tag).toBe('verify-email');
		const vt = decodeURIComponent(/verify-email\?token=([^\s"&]+)/.exec(verify.text)![1]!);
		expect((await http().post('/auth/email/verify').send({ token: vt })).status).toBe(200);

		await sleep(1100); // older tokens must predate the reset by a whole second (JWT iat)
		expect((await forgot('OWNER@example.test')).status).toBe(202);
		await vi(() => outbox.length === 1);
		const mail = outbox[0]!;
		expect(mail).toMatchObject({ to: 'owner@example.test', subject: 'Reset your Chess Trainer password', tag: 'password-reset' });
		expect(mail.text).toContain('https://chess.example.test/reset-password?token=');
		const token = tokenFrom(mail.text);

		expect((await http().post('/auth/password/reset').send({ token: 'x'.repeat(40), password: 'new-pass-123' })).status).toBe(400);
		expect((await http().post('/auth/password/reset').send({ token, password: 'short' })).status).toBe(400);
		const reset = await http().post('/auth/password/reset').send({ token, password: 'new-pass-123' });
		expect(reset.status).toBe(200);
		expect(reset.body.data.user).toMatchObject({ username: 'owner', email: 'owner@example.test' });
		expect((await http().post('/auth/password/reset').send({ token, password: 'again-pass-123' })).status).toBe(400);

		// The old session's refresh token is refused; the new one works.
		expect((await http().post('/auth/refresh').send({ refreshToken: first.refreshToken })).status).toBe(401);
		expect((await http().post('/auth/refresh').send({ refreshToken: reset.body.data.refreshToken })).status).toBe(200);
		expect((await login('owner-pass')).status).toBe(401);
		const fresh = (await login('new-pass-123')).body.data;

		const auth = `Bearer ${fresh.accessToken}`;
		expect((await http().post('/auth/password/change').set('Authorization', auth).send({ currentPassword: 'wrong', newPassword: 'other-pass-1' })).status).toBe(401);
		const changed = await http().post('/auth/password/change').set('Authorization', auth).send({ currentPassword: 'new-pass-123', newPassword: 'owner-pass' });
		expect(changed.status).toBe(200);
		expect(typeof changed.body.data.refreshToken).toBe('string');
		expect((await login('owner-pass')).status).toBe(200);
	});

	it('rate limits reset requests per account (429)', async () => {
		const codes: number[] = [];
		for (let i = 0; i < 4; i++) codes.push((await forgot('limit-me@example.test')).status);
		expect(codes).toEqual([202, 202, 202, 429]);
	});

	it('clears the email with an empty string', async () => {
		const { accessToken } = (await login('owner-pass')).body.data;
		const res = await http().patch('/users/me').set('Authorization', `Bearer ${accessToken}`).send({ email: '' });
		expect(res.body.data.email).toBeNull();
		expect((await http().patch('/users/me').set('Authorization', `Bearer ${accessToken}`).send({ email: 'not-an-email' })).status).toBe(400);
	});
});

describe('mail providers', () => {
	const cfg = (v: Record<string, unknown>) => ({ get: (k: string) => v[k] }) as unknown as ConfigService;

	it('createMailer picks the provider from config', () => {
		expect(createMailer(cfg({ 'mail.provider': 'memory' }))).toBeInstanceOf(MemoryMailer);
		expect(createMailer(cfg({ 'mail.provider': 'none' }))).toBeInstanceOf(DisabledMailer);
		expect(createMailer(cfg({ 'mail.provider': 'resend' })).enabled).toBe(false); // no key → off
		expect(createMailer(cfg({ 'mail.provider': 'resend', 'mail.resendApiKey': 'k', 'mail.from': 'A <a@b.c>' }))).toBeInstanceOf(ResendMailer);
	});

	it('ResendMailer posts to /emails and maps errors', async () => {
		const calls: { url: string; init: RequestInit }[] = [];
		const ok = new ResendMailer({
			apiKey: 'key',
			from: 'Chess <noreply@x.test>',
			fetch: (async (url: string, init: RequestInit) => {
				calls.push({ url, init });
				return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 });
			}) as unknown as typeof fetch,
		});
		const mail = passwordResetMail({ to: 'a@b.test', appName: 'Chess', displayName: 'A <b>', link: 'https://x.test/r?token=1', ttlMinutes: 60 });
		expect(await ok.send(mail)).toEqual({ id: 'msg-1' });
		expect(calls[0]!.url).toBe('https://api.resend.com/emails');
		expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer key');
		const body = JSON.parse(calls[0]!.init.body as string);
		expect(body).toMatchObject({ from: 'Chess <noreply@x.test>', to: ['a@b.test'], subject: 'Reset your Chess password' });
		expect(body.html).toContain('A &lt;b&gt;');

		const bad = new ResendMailer({ apiKey: 'k', from: 'f', fetch: (async () => new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 })) as unknown as typeof fetch });
		await expect(bad.send(mail)).rejects.toThrow(/403 domain not verified/);
	});
});

/** Polls until fn() is true (max ~2 s). */
async function vi(fn: () => boolean): Promise<void> {
	for (let i = 0; i < 40 && !fn(); i++) await sleep(50);
	expect(fn()).toBe(true);
}

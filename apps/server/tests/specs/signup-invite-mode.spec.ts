import request from 'supertest';
import { bootApp, TestApp } from '../helpers/app';

describe('SIGNUP_MODE=invite', () => {
	let t: TestApp;
	const http = () => request(t.app.getHttpServer());

	beforeAll(async () => {
		t = await bootApp({ MAIL_PROVIDER: 'memory', SIGNUP_MODE: 'invite' });
	});
	afterAll(() => t.close());

	it('needs a valid invite', async () => {
		expect((await http().get('/health')).body.data.features.signup).toBe('invite');
		const none = await http().post('/auth/register').send({ username: 'stranger', password: 'stranger-pass' });
		expect(none.status).toBe(403);
		expect((await http().post('/auth/register').send({ username: 'stranger', password: 'stranger-pass', invite: 'not-a-real-code' })).status).toBe(403);
		const owner = (await http().post('/auth/login').send({ username: 'owner', password: 'owner-pass' })).body.data.accessToken;
		const inv = await http().post('/invites').set('Authorization', `Bearer ${owner}`).send({ email: 'pal@example.test' });
		expect((await http().post('/auth/register').send({ username: 'pal', password: 'pal-pass-12', invite: inv.body.data.code })).status).toBe(201);
	});
});

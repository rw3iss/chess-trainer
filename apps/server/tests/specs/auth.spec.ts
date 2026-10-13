import request from 'supertest';
import { bootApp, TestApp } from '../helpers/app';

describe('auth', () => {
	let t: TestApp;
	const http = () => request(t.app.getHttpServer());

	beforeAll(async () => {
		t = await bootApp();
	});
	afterAll(() => t.close());

	it('rejects a bad password with 401', async () => {
		const res = await http().post('/auth/login').send({ username: 'owner', password: 'nope' });
		expect(res.status).toBe(401);
	});

	it('logs in the env-seeded owner, then /auth/me, /users/me and refresh work', async () => {
		const login = await http().post('/auth/login').send({ username: 'OWNER', password: 'owner-pass' });
		expect(login.status).toBe(200);
		const tokens = login.body.data;
		expect(tokens).toMatchObject({ expiresIn: 900, user: { username: 'owner', role: 'owner' } });

		const me = await http().get('/auth/me').set('Authorization', `Bearer ${tokens.accessToken}`);
		expect(me.body.data).toMatchObject({ username: 'owner', role: 'owner' });

		const patched = await http()
			.patch('/users/me')
			.set('Authorization', `Bearer ${tokens.accessToken}`)
			.send({ displayName: 'Boss', preferences: { theme: 'dark' } });
		expect(patched.body.data).toMatchObject({ displayName: 'Boss', preferences: { theme: 'dark' } });

		const refreshed = await http().post('/auth/refresh').send({ refreshToken: tokens.refreshToken });
		expect(refreshed.status).toBe(200);
		expect(refreshed.body.data.user.displayName).toBe('Boss');
		expect(typeof refreshed.body.data.accessToken).toBe('string');
	});

	it('refuses refresh tokens as access tokens and access tokens for refresh', async () => {
		const { body } = await http().post('/auth/login').send({ username: 'owner', password: 'owner-pass' });
		const asAccess = await http().get('/auth/me').set('Authorization', `Bearer ${body.data.refreshToken}`);
		expect(asAccess.status).toBe(401);
		const asRefresh = await http().post('/auth/refresh').send({ refreshToken: body.data.accessToken });
		expect(asRefresh.status).toBe(401);
	});

	it('issues guest tokens usable on @AllowGuest routes only', async () => {
		const g = await http().post('/auth/guest').send({ displayName: 'Visitor' });
		expect(g.status).toBe(200);
		expect(g.body.data.user).toMatchObject({ displayName: 'Visitor', role: 'guest' });
		const auth = `Bearer ${g.body.data.accessToken}`;
		expect((await http().get('/auth/me').set('Authorization', auth)).body.data.role).toBe('guest');
		expect((await http().get('/games').set('Authorization', auth)).status).toBe(403);
	});

	it('validates bodies (unknown fields rejected)', async () => {
		const res = await http().post('/auth/login').send({ username: 'owner', password: 'x', extra: 1 });
		expect(res.status).toBe(400);
	});
});

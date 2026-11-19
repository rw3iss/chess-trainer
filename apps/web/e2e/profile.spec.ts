import { expect, test, type Page, type Route } from '@playwright/test';

// /profile against a mocked same-origin server at /api (page.route): picture upload (multipart), display
// name, email verification state, recovery codes, devices, Lichess sign-in, delete account, owner tools;
// the /verify-email page; resetting the password with a recovery code.
type Chess = { updateSettings(p: unknown): void };

const OWNER = { id: 'u1', username: 'owner', displayName: 'Owner Person', role: 'owner', email: 'me@example.org', emailVerified: false, hasPassword: true, avatarUrl: null, createdAt: Date.UTC(2026, 0, 5) };
const MEMBER = { ...OWNER, id: 'u2', username: 'pal', displayName: 'Pal', role: 'user', emailVerified: true };

// 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

interface Mock {
	calls: { path: string; method: string; body: string | null; auth?: string; contentType?: string }[];
}

async function mockServer(page: Page, opts: { user?: typeof OWNER; oauth?: string[]; verifyStatus?: number } = {}): Promise<Mock> {
	const mock: Mock = { calls: [] };
	let user = { ...(opts.user ?? OWNER) };
	let issued = 0;
	const tokens = () => ({ accessToken: `access-${++issued}`, refreshToken: `refresh-${issued}`, expiresIn: 900, user });
	await page.route((url) => url.pathname.startsWith('/api/'), async (route: Route) => {
		const req = route.request();
		const path = new URL(req.url()).pathname.replace(/^\/api/, '');
		mock.calls.push({ path, method: req.method(), body: req.postData(), auth: req.headers().authorization, contentType: req.headers()['content-type'] });
		const json = (status: number, data: unknown) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { data } : { error: { code: 'x', message: String(data) } }) });
		const body = () => JSON.parse(req.postData() ?? '{}') as Record<string, string>;
		switch (`${req.method()} ${path}`) {
			case 'GET /health':
				return json(200, { status: 'ok', name: 'mock', version: '1.0.0', protocol: 1, features: { auth: true, explorer: false, engines: false, rooms: false, sync: false, passwordReset: true, signup: 'open', oauth: opts.oauth ?? ['google', 'lichess'] } });
			case 'POST /auth/login':
				return json(200, tokens());
			case 'POST /auth/logout':
				return json(204, null);
			case 'GET /users/me':
				return json(200, { ...user, preferences: null });
			case 'PATCH /users/me':
				user = { ...user, ...body() };
				return json(200, user);
			case 'POST /users/me/email/verify':
				return json(202, null);
			case 'POST /auth/email/verify':
				return opts.verifyStatus ? json(opts.verifyStatus, 'bad token') : json(200, { email: 'me@example.org' });
			case 'GET /users/me/identities':
				return json(200, []);
			case 'GET /invites':
				return json(200, []);
			case 'GET /users/me/sessions':
				return json(200, [
					{ id: 's-here', label: 'Chrome on Linux', createdAt: Date.now() - 86_400_000, lastUsedAt: Date.now(), current: true },
					{ id: 's-phone', label: 'Safari on iOS', createdAt: Date.now() - 5 * 86_400_000, lastUsedAt: Date.now() - 3_600_000, current: false },
				]);
			case 'DELETE /users/me/sessions/s-phone':
				return json(204, null);
			case 'GET /users/me/recovery-codes':
				return json(200, { remaining: 0 });
			case 'POST /users/me/recovery-codes':
				return json(200, { codes: ['k3mf-9q2x', 'p7ad-4wzn', 'b2rt-8hye', 'x5nc-1lqo', 'm8vu-6gdk', 'e4js-3tpa', 'w9lb-7zrc', 'h1oy-2fmx'] });
			case 'POST /auth/password/recover':
				return body().code === 'k3mf-9q2x' ? json(200, tokens()) : json(401, 'bad code');
			case 'PUT /users/me/avatar':
				user = { ...user, avatarUrl: '/users/u1/avatar?v=1' };
				return json(200, user);
			case 'GET /users/u1/avatar':
				return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
			case 'DELETE /users/me':
				return json(204, null);
			case 'POST /admin/users/pal/reset-link':
				return json(200, { link: '/reset-password?token=owner-made', expiresAt: Date.now() + 3_600_000 });
			case 'POST /auth/oauth/lichess/start':
				return json(200, { url: `${body().appOrigin}/auth/callback#error=${encodeURIComponent('Lichess sign-in was cancelled.')}` });
			default:
				return json(404, 'not found');
		}
	});
	return mock;
}

async function ready(page: Page) {
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess, null, { timeout: 30_000 });
}

async function connect(page: Page, path: string) {
	await page.goto(path);
	await ready(page);
	await page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.updateSettings({ server: { url: `${location.origin}/api` } }));
	await page.waitForTimeout(400); // settings persist debounce (the account database copies them)
}

const profile = (page: Page) => page.locator('.profile');

async function signIn(page: Page) {
	const form = page.getByRole('form', { name: 'Sign in' });
	await expect(form.getByLabel('Username or email')).toBeEnabled({ timeout: 10_000 });
	await form.getByLabel('Username or email').fill('owner');
	await form.getByLabel('Password', { exact: true }).fill('pw');
	await form.getByRole('button', { name: 'Sign in' }).click();
	await ready(page);
	await expect(profile(page).getByRole('button', { name: 'Sign out', exact: true })).toBeVisible({ timeout: 15_000 });
}

test('signed out: sign-in panel with Google + Lichess, export of this device', async ({ page }) => {
	await mockServer(page);
	await connect(page, '/profile');
	await expect(page.getByRole('heading', { name: 'Profile', level: 2 })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible({ timeout: 10_000 });
	await page.getByRole('button', { name: 'Continue with Lichess' }).click();
	// The mock "provider" returns straight to the callback with an error.
	await expect(page.getByRole('alert')).toContainText('Lichess sign-in was cancelled.');
	await page.goto('/profile');
	await expect(profile(page).getByRole('button', { name: 'Saved games (PGN)' })).toBeVisible();
});

test('profile: picture, name, unverified email, recovery codes, devices, owner tools', async ({ page }) => {
	const mock = await mockServer(page);
	await connect(page, '/profile');
	await signIn(page);
	await expect(profile(page).getByRole('navigation', { name: 'Profile sections' })).toContainText('Owner');
	await expect(profile(page)).toContainText('@owner');

	// Picture: cropped/resized in the browser, uploaded as multipart field `file`.
	await profile(page).locator('input[type="file"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
	await expect.poll(() => mock.calls.find((c) => c.path === '/users/me/avatar' && c.method === 'PUT')?.contentType ?? '').toMatch(/^multipart\/form-data/);
	const upload = mock.calls.find((c) => c.path === '/users/me/avatar')!;
	expect(upload.body).toContain('name="file"');
	expect(upload.auth).toMatch(/^Bearer access-/);
	await expect(profile(page).getByRole('button', { name: 'Change picture' })).toBeVisible();
	await expect(page.getByRole('button', { name: /^Account:/ }).locator('img')).toBeVisible();

	// Display name.
	const nameForm = profile(page).getByRole('form', { name: 'Display name' });
	await nameForm.getByLabel('Display name').fill('The Owner');
	await nameForm.getByRole('button', { name: 'Save' }).click();
	await expect.poll(() => mock.calls.filter((c) => c.method === 'PATCH').map((c) => JSON.parse(c.body!))).toContainEqual({ displayName: 'The Owner' });

	// Email not verified → resend.
	await expect(profile(page).getByText('Not verified')).toBeVisible();
	await profile(page).getByRole('button', { name: 'Resend link' }).click();
	await expect.poll(() => mock.calls.some((c) => c.path === '/users/me/email/verify')).toBe(true);

	// Recovery codes: password asked, 8 codes shown once.
	await profile(page).getByRole('button', { name: 'Make recovery codes' }).click();
	await profile(page).getByRole('form', { name: 'New recovery codes' }).getByLabel('Current password').fill('pw');
	await profile(page).getByRole('button', { name: 'Make 8 new codes' }).click();
	await expect(profile(page).getByRole('list', { name: 'Recovery codes' }).locator('li')).toHaveCount(8);
	expect(JSON.parse(mock.calls.find((c) => c.path === '/users/me/recovery-codes' && c.method === 'POST')!.body!)).toEqual({ currentPassword: 'pw' });
	await profile(page).getByRole('button', { name: 'Done' }).click();

	// Devices: sign out the phone; this device is marked.
	const devices = profile(page).getByRole('list', { name: 'Signed-in devices' });
	await expect(devices).toContainText('This device');
	await devices.getByRole('button', { name: 'Sign out Safari on iOS' }).click();
	await expect(devices).not.toContainText('Safari on iOS');
	expect(mock.calls.some((c) => c.method === 'DELETE' && c.path === '/users/me/sessions/s-phone')).toBe(true);

	// Owner tools: a reset link for another user.
	const owner = profile(page).getByRole('form', { name: 'Reset link for a user' });
	await owner.getByLabel('Username').fill('pal');
	await owner.getByRole('button', { name: 'Make link' }).click();
	await expect(profile(page).getByRole('status').filter({ hasText: '/reset-password?token=owner-made' })).toBeVisible();
	// The owner cannot delete the account.
	await expect(profile(page).getByRole('button', { name: 'Delete account…' })).toHaveCount(0);

	// Sign out tells the server.
	await profile(page).getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect.poll(() => mock.calls.find((c) => c.path === '/auth/logout')?.body).toBe(JSON.stringify({ refreshToken: 'refresh-1' }));
});

test('delete account: confirm with username + password → back to anonymous', async ({ page }) => {
	const mock = await mockServer(page, { user: MEMBER });
	await connect(page, '/profile');
	await signIn(page);
	await profile(page).getByRole('button', { name: 'Delete account…' }).click();
	const form = profile(page).getByRole('form', { name: 'Delete account' });
	const submit = form.getByRole('button', { name: 'Delete my account' });
	await expect(submit).toBeDisabled();
	await form.getByLabel(/Type your username/).fill('pal');
	await form.getByLabel('Password', { exact: true }).fill('pw');
	await submit.click();
	await expect.poll(() => mock.calls.find((c) => c.method === 'DELETE' && c.path === '/users/me')?.body).toBe(JSON.stringify({ password: 'pw' }));
	await ready(page);
	await expect(page.getByRole('button', { name: /^Account:/ })).toHaveAccessibleName('Account: anonymous', { timeout: 15_000 });
});

test('verify-email page: success and a bad link', async ({ page }) => {
	const mock = await mockServer(page);
	await connect(page, '/verify-email?token=tok-1');
	await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible({ timeout: 10_000 });
	await expect(page.getByRole('status')).toContainText('me@example.org is verified');
	expect(mock.calls.find((c) => c.path === '/auth/email/verify')?.body).toBe(JSON.stringify({ token: 'tok-1' }));
	await page.getByRole('button', { name: 'Go to profile' }).click();
	await expect(page).toHaveURL(/\/profile$/);
});

test('verify-email page: an expired link reads clearly; no token too', async ({ page }) => {
	await mockServer(page, { verifyStatus: 400 });
	await connect(page, '/verify-email?token=old');
	await expect(page.getByRole('alert')).toContainText('invalid, used or expired');
	await page.goto('/verify-email');
	await expect(page.getByRole('alert')).toContainText('no verification code');
});

test('forgot password → recovery code → signed in', async ({ page }) => {
	const mock = await mockServer(page);
	await connect(page, '/profile');
	await expect(page.getByLabel('Username or email')).toBeEnabled({ timeout: 10_000 });
	await page.getByRole('button', { name: 'Use a recovery code' }).click();
	const form = page.getByRole('form', { name: 'Use a recovery code' });
	await form.getByLabel('Username').fill('owner');
	await form.getByLabel('Recovery code').fill('wrong-code');
	await form.getByLabel('New password', { exact: true }).fill('a-long-password');
	await form.getByLabel('Confirm new password').fill('a-long-password');
	await form.getByRole('button', { name: 'Set new password' }).click();
	await expect(form.getByRole('alert')).toContainText('Wrong username or recovery code');
	await form.getByLabel('Recovery code').fill('k3mf-9q2x');
	await form.getByRole('button', { name: 'Set new password' }).click();
	await expect.poll(() => mock.calls.filter((c) => c.path === '/auth/password/recover').length).toBe(2);
	await ready(page);
	await expect(profile(page).getByRole('button', { name: 'Sign out', exact: true })).toBeVisible({ timeout: 15_000 });
});

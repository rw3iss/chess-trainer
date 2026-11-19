import { expect, test, type Page, type Route } from '@playwright/test';

// Password reset + account (email, change password) against a mocked same-origin server at /api
// (page.route): forgot-password form, the /reset-password page from the email link, and the
// signed-in profile page.
type Chess = { updateSettings(p: unknown): void };

const USER = { id: 'u1', username: 'owner', displayName: 'Owner', role: 'owner' };
const tokens = (n: number, email: string | null = 'me@example.org') => ({
	accessToken: `access-${n}`,
	refreshToken: `refresh-${n}`,
	expiresIn: 900,
	user: { ...USER, email },
});

interface Mock {
	calls: { path: string; method: string; body: unknown; auth?: string }[];
	email: string | null;
}

/** Mock server at <origin>/api; returns the call log. */
async function mockServer(page: Page, opts: { forgotStatus?: number; resetStatus?: number; changeStatus?: number; passwordReset?: boolean } = {}): Promise<Mock> {
	const mock: Mock = { calls: [], email: 'me@example.org' };
	let issued = 0;
	await page.route((url) => url.pathname.startsWith('/api/'), async (route: Route) => {
		const req = route.request();
		const path = new URL(req.url()).pathname.replace(/^\/api/, '');
		const body = req.postData() ? JSON.parse(req.postData()!) : undefined;
		mock.calls.push({ path, method: req.method(), body, auth: req.headers().authorization });
		const json = (status: number, data: unknown) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { data } : { error: { code: 'x', message: String(data) } }) });
		switch (`${req.method()} ${path}`) {
			case 'GET /health':
				return json(200, { status: 'ok', name: 'mock', version: '1.0.0', protocol: 1, features: { auth: true, explorer: false, engines: false, rooms: false, sync: false, passwordReset: opts.passwordReset ?? true } });
			case 'POST /auth/login':
				return json(200, tokens(++issued, mock.email));
			case 'POST /auth/password/forgot':
				return opts.forgotStatus ? json(opts.forgotStatus, 'nope') : json(202, { sent: true });
			case 'POST /auth/password/reset':
				return opts.resetStatus ? json(opts.resetStatus, 'invalid') : json(200, tokens(++issued, mock.email));
			case 'POST /auth/password/change':
				return opts.changeStatus ? json(opts.changeStatus, 'wrong') : json(200, tokens(++issued, mock.email));
			case 'GET /users/me':
				return json(200, { ...USER, email: mock.email, emailVerified: true, preferences: null });
			case 'GET /users/me/identities':
			case 'GET /users/me/sessions':
			case 'GET /invites':
				return json(200, []);
			case 'GET /users/me/recovery-codes':
				return json(200, { remaining: 0 });
			case 'PATCH /users/me':
				mock.email = (body as { email: string }).email || null;
				return json(200, { ...USER, email: mock.email, preferences: null });
			default:
				return json(404, 'not found');
		}
	});
	return mock;
}

async function connect(page: Page, path: string) {
	await page.goto(path);
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess, null, { timeout: 30_000 });
	await page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.updateSettings({ server: { url: `${location.origin}/api` } }));
}

const account = (page: Page) => page.locator('.profile');
/** Profile page, signed out, once the server answered (the sign-in fields enable). */
async function profileReady(page: Page) {
	await expect(account(page).getByLabel('Username or email')).toBeEnabled({ timeout: 10_000 });
}

test('forgot password: sends the identifier and shows a neutral confirmation', async ({ page }) => {
	const mock = await mockServer(page);
	await connect(page, '/profile');
	await profileReady(page);
	await account(page).getByLabel('Username or email').fill('owner');
	await account(page).getByRole('button', { name: 'Forgot password?' }).click();
	const field = account(page).getByLabel('Username or email');
	await expect(field).toHaveValue('owner');
	await field.fill(' me@example.org ');
	await account(page).getByRole('button', { name: 'Send reset link' }).click();
	await expect(account(page).getByRole('status')).toContainText('a reset link is on its way');
	expect(mock.calls.find((c) => c.path === '/auth/password/forgot')?.body).toEqual({ identifier: 'me@example.org' });
	await account(page).getByRole('button', { name: 'Back to sign in' }).click();
	await expect(account(page).getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('forgot password: a server without email reads clearly', async ({ page }) => {
	await mockServer(page, { forgotStatus: 503 });
	await connect(page, '/profile');
	await profileReady(page);
	await account(page).getByRole('button', { name: 'Forgot password?' }).click();
	await account(page).getByLabel('Username or email').fill('owner');
	await account(page).getByRole('button', { name: 'Send reset link' }).click();
	await expect(account(page)).toContainText('Password reset by email is not set up on this server.');
});

test('without email on the server, forgot password goes straight to a recovery code', async ({ page }) => {
	await mockServer(page, { passwordReset: false });
	await connect(page, '/profile');
	await profileReady(page);
	await expect(account(page).getByRole('button', { name: 'Use a recovery code' })).toHaveCount(0);
	await account(page).getByRole('button', { name: 'Forgot password?' }).click();
	await expect(account(page).getByRole('form', { name: 'Use a recovery code' })).toBeVisible();
	await expect(account(page).getByRole('button', { name: 'Send reset link' })).toHaveCount(0);
});

test('reset link: set a new password → signed in on the profile', async ({ page }) => {
	const mock = await mockServer(page);
	await connect(page, '/reset-password?token=tok-123');
	await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
	const submit = page.getByRole('button', { name: 'Set password' });
	await page.getByLabel('New password', { exact: true }).fill('short');
	await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
	await page.getByLabel('New password', { exact: true }).fill('a-long-password');
	await page.getByLabel('Confirm new password').fill('a-long-passwordX');
	await expect(page.getByText('The passwords do not match.')).toBeVisible();
	await expect(submit).toBeDisabled();
	await page.getByLabel('Confirm new password').fill('a-long-password');
	await submit.click();
	await expect(page).toHaveURL(/\/profile$/);
	expect(mock.calls.find((c) => c.path === '/auth/password/reset')?.body).toEqual({ token: 'tok-123', password: 'a-long-password' });
	await expect(account(page).getByRole('button', { name: 'Sign out' })).toBeVisible();
	await expect(account(page).getByLabel('Email', { exact: true })).toHaveValue('me@example.org');
});

test('reset link: an expired link and a missing token read clearly', async ({ page }) => {
	await mockServer(page, { resetStatus: 400 });
	await connect(page, '/reset-password?token=old');
	await page.getByLabel('New password', { exact: true }).fill('a-long-password');
	await page.getByLabel('Confirm new password').fill('a-long-password');
	await page.getByRole('button', { name: 'Set password' }).click();
	await expect(page.getByRole('alert')).toContainText('invalid, used or expired');
	await page.goto('/reset-password');
	await expect(page.getByRole('alert')).toContainText('has no reset code');
	await page.getByRole('button', { name: 'Go to sign in' }).click();
	await expect(page).toHaveURL(/\/profile$/);
});

test('signed in: save the email and change the password', async ({ page }) => {
	const mock = await mockServer(page, {});
	await connect(page, '/profile');
	await profileReady(page);
	await account(page).getByLabel('Username or email').fill('owner');
	await account(page).getByLabel('Password', { exact: true }).fill('owner-pass');
	await account(page).getByRole('button', { name: 'Sign in' }).click();
	await expect(account(page).getByRole('button', { name: 'Sign out' })).toBeVisible();

	const email = account(page).getByLabel('Email', { exact: true });
	await expect(email).toHaveValue('me@example.org');
	await email.fill('new@example.org');
	const emailForm = account(page).getByRole('form', { name: 'Account email' });
	await emailForm.getByRole('button', { name: 'Save' }).click();
	await expect.poll(() => mock.calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({ email: 'new@example.org' });
	await expect(emailForm.getByRole('button', { name: 'Save' })).toBeDisabled();

	await account(page).getByRole('button', { name: 'Change password' }).click();
	await account(page).getByLabel('Current password').fill('owner-pass');
	await account(page).getByLabel('New password', { exact: true }).fill('a-new-password');
	await account(page).getByLabel('Confirm new password').fill('a-new-password');
	await account(page).getByRole('button', { name: 'Change password' }).click();
	await expect.poll(() => mock.calls.find((c) => c.path === '/auth/password/change')).toMatchObject({
		body: { currentPassword: 'owner-pass', newPassword: 'a-new-password' },
		auth: 'Bearer access-1',
	});
	await expect(account(page).getByLabel('Current password')).toHaveCount(0);
	await expect(account(page).getByRole('button', { name: 'Sign out' })).toBeVisible();
});

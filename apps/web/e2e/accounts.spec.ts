import { expect, test, type Page, type Route } from '@playwright/test';

// Accounts against a mocked same-origin server at /api (page.route): sign-up (+ invite preview), Google
// sign-in (start → provider → /auth/callback → exchange), one local database per account (switching keeps
// data apart, copy prompt), invite a friend, linked sign-ins.
type Chess = {
	updateSettings(p: unknown): void;
	sessionsActions: { newSession(o?: unknown): { id: string } };
	flushStores(): Promise<void>;
	openSessions: { value: { id: string }[] };
};

const OWNER = { id: 'u1', username: 'owner', displayName: 'Owner Person', role: 'owner', email: 'me@example.org', hasPassword: true };

interface MockOpts {
	signup?: 'open' | 'invite' | 'off';
	oauth?: string[];
	unlinkStatus?: number;
}
interface Mock {
	calls: { path: string; method: string; body: unknown; auth?: string }[];
}

async function mockServer(page: Page, opts: MockOpts = {}): Promise<Mock> {
	const mock: Mock = { calls: [] };
	let issued = 0;
	const tokens = (user: Record<string, unknown>) => ({ accessToken: `access-${++issued}`, refreshToken: `refresh-${issued}`, expiresIn: 900, user });
	await page.route((url) => url.pathname.startsWith('/api/'), async (route: Route) => {
		const req = route.request();
		const url = new URL(req.url());
		const path = url.pathname.replace(/^\/api/, '');
		const body = req.postData() ? JSON.parse(req.postData()!) : undefined;
		mock.calls.push({ path, method: req.method(), body, auth: req.headers().authorization });
		const json = (status: number, data: unknown) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { data } : { error: { code: 'x', message: String(data) } }) });
		const key = `${req.method()} ${path}`;
		if (key === 'GET /health')
			return json(200, {
				status: 'ok',
				name: 'mock',
				version: '1.0.0',
				protocol: 1,
				features: { auth: true, explorer: false, engines: false, rooms: false, sync: false, passwordReset: true, signup: opts.signup ?? 'open', oauth: opts.oauth ?? ['google'] },
			});
		if (key === 'POST /auth/login') return json(200, tokens(OWNER));
		if (key === 'POST /auth/register') {
			const b = body as { username: string; displayName?: string; email?: string };
			return json(200, tokens({ id: 'u-new', username: b.username, displayName: b.displayName ?? b.username, role: 'user', email: b.email ?? null, hasPassword: true }));
		}
		if (key === 'GET /invites/inv-1') return json(200, { inviter: { username: 'owner', displayName: 'Owner Person' }, email: 'friend@example.org' });
		if (key === 'POST /auth/oauth/google/start') {
			const b = body as { appOrigin: string };
			// The "provider" sends the browser straight back to the app callback.
			return json(200, { url: `${b.appOrigin}/auth/callback#code=g-code` });
		}
		if (key === 'POST /auth/oauth/exchange') return json(200, { ...tokens({ ...OWNER, id: 'u-g', username: 'gina', displayName: 'Gina G', hasPassword: false }), returnTo: '/games', created: true, linked: false });
		if (key === 'GET /users/me') return json(200, { ...OWNER, preferences: null });
		if (key === 'GET /users/me/identities') return json(200, [{ provider: 'google', label: 'me@gmail.test', linkedAt: 1 }]);
		if (key === 'DELETE /users/me/identities/google') return opts.unlinkStatus ? json(opts.unlinkStatus, 'only sign-in') : json(200, null);
		if (key === 'GET /invites') return json(200, []);
		if (key === 'POST /invites') {
			const b = body as { email: string };
			return json(200, { code: 'inv-9', link: '/signup?invite=inv-9', email: b.email, createdAt: Date.now(), acceptedAt: null });
		}
		return json(404, 'not found');
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

const accountButton = (page: Page) => page.getByRole('button', { name: /^Account:/ });
const sessionIds = (page: Page) => page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.openSessions.value.map((s) => s.id));

test('sign-up with an invite link: preview, validation, account created → own database', async ({ page }) => {
	const mock = await mockServer(page);
	await connect(page, '/');
	await page.goto('/signup?invite=inv-1');
	await expect(page.getByRole('status').filter({ hasText: 'Invited by' })).toContainText('Owner Person');
	await expect(page.getByLabel('Email (optional)')).toHaveValue('friend@example.org');
	const submit = page.getByRole('button', { name: 'Create account' });
	await page.getByLabel('Username', { exact: true }).fill('No Spaces');
	await expect(page.getByText('3–24 characters: letters, digits, _ or -.')).toBeVisible();
	await expect(submit).toBeDisabled();
	await page.getByLabel('Username', { exact: true }).fill('newbie');
	await page.getByLabel('Display name (optional)').fill('New Bie');
	await page.getByLabel('Password', { exact: true }).fill('a-long-password');
	await page.getByLabel('Confirm password').fill('a-long-password');
	await submit.click();
	await expect.poll(() => mock.calls.find((c) => c.path === '/auth/register')?.body).toEqual({
		username: 'newbie',
		password: 'a-long-password',
		displayName: 'New Bie',
		email: 'friend@example.org',
		invite: 'inv-1',
	});
	await ready(page);
	await expect(accountButton(page)).toHaveAccessibleName('Account: New Bie');
	await expect(accountButton(page)).toHaveText('NB');
});

test('sign-up closed / invite-only read clearly', async ({ page }) => {
	await mockServer(page, { signup: 'invite' });
	await connect(page, '/');
	await page.goto('/signup');
	await expect(page.getByRole('alert')).toContainText('needs an invite');
});

test('Continue with Google → callback → signed in on the returned page; errors read clearly', async ({ page }) => {
	const mock = await mockServer(page);
	await connect(page, '/settings/server');
	await expect(page.getByText('Online', { exact: true })).toBeVisible({ timeout: 10_000 });
	await page.getByRole('button', { name: 'Continue with Google' }).first().click();
	await expect.poll(() => mock.calls.find((c) => c.path === '/auth/oauth/exchange')?.body).toEqual({ code: 'g-code' });
	const start = mock.calls.find((c) => c.path === '/auth/oauth/google/start')!.body as Record<string, string>;
	expect(start).toMatchObject({ mode: 'signin', returnTo: '/settings/server' });
	expect(start.apiBase).toMatch(/^http:\/\/[^/]+\/api$/);
	await expect(page).toHaveURL(/\/games$/);
	await ready(page);
	await expect(accountButton(page)).toHaveAccessibleName('Account: Gina G');

	await page.goto('/auth/callback#error=access_denied');
	await expect(page.getByRole('alert')).toContainText('access_denied');
});

test('accounts keep their own data; the copy prompt; switch back to anonymous', async ({ page }) => {
	await mockServer(page);
	await connect(page, '/');
	const anonId = await page.evaluate(async () => {
		const c = (window as unknown as { __chess: Chess }).__chess;
		const id = c.sessionsActions.newSession().id;
		await c.flushStores();
		return id;
	});
	await page.goto('/settings/server');
	await page.locator('section[aria-labelledby="server-settings-account"]').getByLabel('Username', { exact: true }).fill('owner');
	await page.locator('section[aria-labelledby="server-settings-account"]').getByLabel('Password', { exact: true }).fill('pw');
	await page.locator('section[aria-labelledby="server-settings-account"]').getByRole('button', { name: 'Sign in' }).click();

	// Reloaded into the owner's database: offered to copy the anonymous data.
	const dialog = page.getByRole('dialog', { name: /Copy this device's games and sessions into Owner Person/ });
	await expect(dialog).toBeVisible({ timeout: 15_000 });
	await dialog.getByRole('button', { name: 'Not now' }).click();
	await expect(dialog).toBeHidden();
	await page.waitForTimeout(300); // the answer is saved to IndexedDB before the next page load
	await ready(page);
	expect(await sessionIds(page)).not.toContain(anonId);

	// Switch to anonymous from the account menu (on the board view: on phones, settings is a sheet over the header).
	await page.goto('/');
	await ready(page);
	await accountButton(page).click();
	await page.getByRole('menuitemcheckbox', { name: /Anonymous/ }).click();
	await expect(accountButton(page)).toHaveAccessibleName('Account: anonymous', { timeout: 15_000 });
	await ready(page);
	await expect.poll(() => sessionIds(page)).toContain(anonId);

	// And back to the owner (stashed tokens: no sign-in needed).
	await accountButton(page).click();
	await page.getByRole('menuitemcheckbox', { name: /Owner Person/ }).click();
	await expect(accountButton(page)).toHaveAccessibleName('Account: Owner Person', { timeout: 15_000 });
	await ready(page);
	expect(await sessionIds(page)).not.toContain(anonId);
});

test('signed in: linked sign-ins (unlink refused when it is the only one) and invite a friend', async ({ page }) => {
	const mock = await mockServer(page, { unlinkStatus: 409 });
	await connect(page, '/settings/server');
	const card = page.locator('section[aria-labelledby="server-settings-account"]');
	await card.getByLabel('Username', { exact: true }).fill('owner');
	await card.getByLabel('Password', { exact: true }).fill('pw');
	await card.getByRole('button', { name: 'Sign in' }).click();
	await ready(page);
	const dialog = page.getByRole('dialog');
	if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: 'Not now' }).click();

	await expect(card.getByText('me@gmail.test')).toBeVisible({ timeout: 15_000 });
	await card.getByRole('button', { name: 'Unlink' }).click();
	await expect(card.getByRole('alert').filter({ hasText: 'only way to sign in' })).toBeVisible();

	await card.getByLabel("Friend's email").fill('pal@example.org');
	await card.getByLabel('Message (optional)').fill('Join me');
	await card.getByRole('button', { name: 'Send invite' }).click();
	await expect.poll(() => mock.calls.find((c) => c.path === '/invites' && c.method === 'POST')?.body).toEqual({ email: 'pal@example.org', message: 'Join me' });
	await expect(card.getByRole('status').filter({ hasText: '/signup?invite=inv-9' })).toBeVisible();
	await expect(card.getByRole('list', { name: 'Sent invites' })).toContainText('pal@example.org');
});

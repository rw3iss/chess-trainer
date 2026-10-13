import { expect, test, type Browser, type Page } from '@playwright/test';

// Online rooms against a REAL server (PLAN §9 "WS room test with two clients").
// Start it first: `pnpm --filter @chess/core build && cd apps/server && PORT=3200 DB_PATH=:memory: pnpm start`
// then `E2E_SERVER_URL=http://localhost:3200 pnpm test:e2e online`. Skipped when unreachable.
const SERVER = process.env.E2E_SERVER_URL ?? 'http://localhost:3200';

type Chess = {
	updateSettings(p: unknown): void;
	authActions: { setGuestName(n: string): Promise<void> };
	currentRoom: { value: { moves: string[]; chat: { text: string }[] } | null };
};

async function serverUp(): Promise<boolean> {
	try {
		const res = await fetch(`${SERVER}/health`);
		return res.ok;
	} catch {
		return false;
	}
}

async function openWithServer(browser: Browser, name: string, viewport: { width: number; height: number }): Promise<Page> {
	const ctx = await browser.newContext({ viewport });
	const page = await ctx.newPage();
	await page.goto('/');
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess);
	await page.evaluate(
		async ([url, n]) => {
			const c = (window as unknown as { __chess: Chess }).__chess;
			c.updateSettings({ server: { url } });
			await c.authActions.setGuestName(n!);
		},
		[SERVER, name],
	);
	await expect(page.locator('.topnav').getByText(/online/i).first())
		.toBeVisible({ timeout: 10_000 })
		.catch(() => undefined);
	return page;
}

/** Click a square on the stage board (click-click input). */
async function clickSquare(page: Page, sq: string, orientation: 'white' | 'black'): Promise<void> {
	const board = page.locator('[aria-label^="Chess board"]').first();
	const box = (await board.boundingBox())!;
	const file = sq.charCodeAt(0) - 97;
	const rank = Number(sq[1]) - 1;
	const col = orientation === 'white' ? file : 7 - file;
	const row = orientation === 'white' ? 7 - rank : rank;
	const size = box.width / 8;
	await page.mouse.click(box.x + (col + 0.5) * size, box.y + (row + 0.5) * size);
}

async function move(page: Page, uci: string, orientation: 'white' | 'black'): Promise<void> {
	// Board becomes movable only on my turn; let the last move's animation settle.
	await expect(page.locator('.room-view__status')).toHaveText('Your move.');
	await page.waitForTimeout(250);
	await clickSquare(page, uci.slice(0, 2), orientation);
	await clickSquare(page, uci.slice(2, 4), orientation);
}

const roomMoves = (page: Page) => page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.currentRoom.value?.moves ?? []);

test.describe('online room (real server)', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'chromium only');

	test('two players create/join a room, play moves and chat', async ({ browser }, info) => {
		test.setTimeout(90_000);
		test.skip(!(await serverUp()), `server not running at ${SERVER}`);
		const viewport = info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
		const ann = await openWithServer(browser, 'Ann', viewport);
		const bob = await openWithServer(browser, 'Bob', viewport);

		// Ann creates a room as white.
		await ann.goto('/play/new');
		await ann.getByRole('radio', { name: 'White' }).click();
		await ann.getByRole('button', { name: 'Create room' }).click();
		await expect(ann).toHaveURL(/\/play\/[A-Za-z0-9_-]+$/);
		await expect(ann.getByText('Waiting for an opponent')).toBeVisible();
		const link = await ann.locator('.share-link__input').first().inputValue();
		expect(link).toContain('/play/');
		await ann.screenshot({ path: `screenshots/play-room-waiting-${info.project.name}.png` });

		// Bob joins by link.
		await bob.goto(new URL(link).pathname);
		await expect(bob.getByText('Opponent to move.')).toBeVisible({ timeout: 10_000 });
		await expect(ann.getByText('Your move.')).toBeVisible();
		await expect(ann.locator('.room-players__name', { hasText: 'Bob' })).toBeVisible();

		// Moves through the real board UI.
		await move(ann, 'e2e4', 'white');
		await expect.poll(() => roomMoves(bob)).toEqual(['e2e4']);
		await move(bob, 'e7e5', 'black');
		await expect.poll(() => roomMoves(ann)).toEqual(['e2e4', 'e7e5']);
		await move(ann, 'g1f3', 'white');
		await expect.poll(() => roomMoves(bob)).toEqual(['e2e4', 'e7e5', 'g1f3']);
		// Out of turn: Ann cannot move (board not movable) → nothing changes.
		await clickSquare(ann, 'f1', 'white');
		await clickSquare(ann, 'c4', 'white');
		await ann.waitForTimeout(300);
		expect(await roomMoves(ann)).toEqual(['e2e4', 'e7e5', 'g1f3']);

		// Chat both ways.
		await ann.getByLabel('Chat message').fill('Good luck!');
		await ann.getByRole('button', { name: 'Send' }).click();
		await expect(bob.locator('.chat-panel__text', { hasText: 'Good luck!' })).toBeVisible();
		await bob.getByLabel('Chat message').fill('You too');
		await bob.keyboard.press('Enter');
		await expect(ann.locator('.chat-panel__text', { hasText: 'You too' })).toBeVisible();
		await ann.screenshot({ path: `screenshots/play-room-${info.project.name}.png`, fullPage: true });
		await bob.screenshot({ path: `screenshots/play-room-black-${info.project.name}.png`, fullPage: true });

		// Draw offer → decline, then resign.
		await bob.getByRole('button', { name: 'Offer draw' }).click();
		await expect(ann.getByText('Your opponent offers a draw.')).toBeVisible();
		await ann.getByRole('button', { name: 'Decline' }).click();
		await ann.getByRole('button', { name: 'Resign' }).click();
		await ann.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
		await expect(bob.getByText('You won by resignation.')).toBeVisible();
		await expect(ann.getByText('You lost by resignation.')).toBeVisible();

		// Reconnect: Bob reloads and gets his seat + moves back.
		await bob.reload();
		await expect.poll(() => roomMoves(bob), { timeout: 10_000 }).toEqual(['e2e4', 'e7e5', 'g1f3']);
		await expect(bob.getByText('You won by resignation.')).toBeVisible();

		await ann.context().close();
		await bob.context().close();
	});

	test('lobby screenshot', async ({ browser }, info) => {
		test.skip(!(await serverUp()), `server not running at ${SERVER}`);
		const viewport = info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
		const page = await openWithServer(browser, 'Ann', viewport);
		await page.goto('/play/new');
		await expect(page.getByRole('button', { name: 'Create room' })).toBeVisible();
		await page.screenshot({ path: `screenshots/play-lobby-${info.project.name}.png`, fullPage: true });
		await page.context().close();
	});
});

import { expect, test, type Page } from '@playwright/test';

// Eval bar: the strip shortcut turns it on (runs the real Stockfish lite worker), it updates on moves,
// sits on the side chosen in Settings → Board, follows the board orientation, and hides in games.
type Chess = {
	sessionsActions: { move(u: string): unknown; newSession(): unknown; update(p: unknown): unknown };
	activeSession: { value: { orientation: string } | null };
	updateSettings(p: unknown): void;
};

async function start(page: Page) {
	await page.goto('/');
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess, null, { timeout: 30_000 });
	await page.evaluate(() => {
		const c = (window as unknown as { __chess: Chess }).__chess;
		c.sessionsActions.newSession();
		c.sessionsActions.move('e2e4');
	});
}

const meter = (page: Page) => page.locator('.stage').getByRole('meter', { name: 'Evaluation' });
/** Desktop: the rail left of the board; phones (stacked): the end of the bottom player strip. */
const toggle = (page: Page) => page.locator('.stage__rail, .player-strip--bottom').getByRole('button', { name: 'Evaluation bar' }).locator('visible=true');

/** Where the bar sits relative to the board. */
async function sideOf(page: Page): Promise<string> {
	const b = (await page.locator('.stage__board').boundingBox())!;
	const m = (await meter(page).boundingBox())!;
	const cx = m.x + m.width / 2;
	const cy = m.y + m.height / 2;
	if (m.width > m.height) return cy < b.y + 2 ? 'top' : cy > b.y + b.height - 2 ? 'bottom' : 'inside';
	return cx < b.x + b.width * 0.1 ? 'left' : cx > b.x + b.width * 0.9 ? 'right' : 'inside';
}

test('eval bar: strip toggle runs the engine, updates on moves, follows side + orientation', async ({ page }) => {
	test.setTimeout(60_000);
	await start(page);
	await expect(meter(page)).toHaveCount(0);
	await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
	await toggle(page).click();
	await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

	// The real engine fills in a score (e.g. "+0.3 (white 52.1%)").
	await expect(meter(page)).toHaveAttribute('aria-valuetext', /^[+-]?\d|^#|^0\.0/, { timeout: 30_000 });
	const before = await meter(page).getAttribute('aria-valuetext');
	// 1…f6 2.Qh5+ is a clear swing for White: the bar moves.
	await page.evaluate(() => {
		const c = (window as unknown as { __chess: Chess }).__chess;
		c.sessionsActions.move('f7f6');
		c.sessionsActions.move('d1h5');
	});
	await expect.poll(() => meter(page).getAttribute('aria-valuetext'), { timeout: 30_000 }).not.toBe(before);

	await expect.poll(() => sideOf(page)).toBe('left');
	if (test.info().project.name === 'desktop') {
		// The toggle sits left of the board, vertically centered, with the left bar between them.
		const t = (await toggle(page).boundingBox())!;
		const m = (await meter(page).boundingBox())!;
		const b = (await page.locator('.stage__board').boundingBox())!;
		expect(t.x + t.width).toBeLessThanOrEqual(m.x);
		expect(Math.abs(t.y + t.height / 2 - (b.y + b.height / 2))).toBeLessThan(4);
	}
	for (const side of ['right', 'top', 'bottom', 'left'] as const) {
		await page.evaluate((s) => (window as unknown as { __chess: Chess }).__chess.updateSettings({ board: { evalBarSide: s } }), side);
		await expect.poll(() => sideOf(page)).toBe(side);
	}

	// Orientation: black at the bottom → the bar marks it (black fills from the bottom / right).
	await expect(meter(page)).toHaveClass(/eval-bar--white/);
	await page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.sessionsActions.update({ orientation: 'black' }));
	await expect(meter(page)).toHaveClass(/eval-bar--black/);

	// Off again from the strip.
	await toggle(page).click();
	await expect(meter(page)).toHaveCount(0);
});

test('eval bar: hidden in games unless "Show in games" is on', async ({ page }) => {
	await start(page);
	await page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.updateSettings({ board: { evalBar: true } }));
	await expect(meter(page)).toBeVisible();
	await page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.sessionsActions.update({ mode: 'local-pvp' }));
	await expect(meter(page)).toHaveCount(0);
	await expect(toggle(page)).toHaveCount(0);
	await page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.updateSettings({ board: { evalBarInGames: true } }));
	await expect(meter(page)).toBeVisible();
	await expect(toggle(page)).toBeVisible();
});

test('eval bar settings: Settings → Board sets the side', async ({ page }, info) => {
	test.skip(info.project.name === 'mobile', 'the hero board is hidden on settings routes on phones');
	await start(page);
	await page.waitForTimeout(600); // session persist debounce, so it is active after the reload
	await page.goto('/settings/board');
	await page.getByRole('switch', { name: 'Show evaluation bar' }).first().click();
	await page.getByRole('radiogroup', { name: 'Evaluation bar position' }).getByRole('radio', { name: 'Top' }).click();
	await expect(meter(page)).toBeVisible();
	await expect.poll(() => sideOf(page)).toBe('top');
});

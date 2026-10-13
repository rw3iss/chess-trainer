import { expect, test, type Page } from '@playwright/test';

// Play page: header button → bot game starts and the bot replies → New game → local 2-player game.

type Chess = { activeSession: { value: { mode: string; tree: { nodes: Record<string, unknown> } } | null } };

const session = (page: Page) =>
	page.evaluate(() => {
		const s = (window as unknown as { __chess: Chess }).__chess.activeSession.value;
		return s ? { mode: s.mode, nodes: Object.keys(s.tree.nodes).length } : null;
	});

async function clickSquare(page: Page, sq: string): Promise<void> {
	const box = (await page.locator('.stage__board .board').first().boundingBox())!;
	const size = box.width / 8;
	await page.mouse.click(box.x + (sq.charCodeAt(0) - 97 + 0.5) * size, box.y + (8 - Number(sq[1]) + 0.5) * size);
}

test('Play: start a bot game, bot replies; then a local 2-player game', async ({ page }, info) => {
	await page.goto('/');
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess);
	await expect(page).toHaveTitle(/Chess Trainer/);

	if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Play', exact: true }).click();
	else await page.getByRole('link', { name: 'Play', exact: true }).click();
	await expect(page).toHaveURL(/\/play$/);
	await expect(page.getByRole('heading', { name: 'New game' })).toBeVisible();

	await page.getByRole('radio', { name: 'Bot' }).click();
	await page.getByRole('radio', { name: 'White' }).click();
	await page.getByRole('button', { name: 'Start game' }).click();
	await expect(page.getByRole('heading', { name: 'Playing' })).toBeVisible();
	expect((await session(page))?.mode).toBe('bot');

	await clickSquare(page, 'e2');
	await clickSquare(page, 'e4');
	await expect.poll(async () => (await session(page))?.nodes, { timeout: 20_000 }).toBeGreaterThanOrEqual(3); // root + e4 + reply
	await page.screenshot({ path: `test-results/quick-play-bot-${info.project.name}.png` });

	await page.getByRole('button', { name: 'New game' }).click();
	await page.getByRole('radio', { name: '2 players' }).click();
	await page.getByRole('button', { name: 'Start game' }).click();
	await expect(page.getByRole('heading', { name: 'Playing' })).toBeVisible();
	expect((await session(page))?.mode).toBe('local-pvp');
	await page.screenshot({ path: `test-results/quick-play-local-${info.project.name}.png` });
});

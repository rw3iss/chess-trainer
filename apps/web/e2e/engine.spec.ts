import { expect, test, type Page } from '@playwright/test';

// PLAN §9 flow 2: moves in analysis → Play with Bot (1500, black) → bot replies → detach.
// Uses the real Stockfish 19 lite worker (public/engines/stockfish).
interface ChessHandle {
	sessionsActions: { move(u: string): unknown; newSession(): unknown };
	activeSession: { value: { mode: string; cursor: string; bot?: { color: string; targetElo: number }; tree: { nodes: Record<string, { ply: number; uci?: string }> } } | null };
}

const handle = (page: Page) => page.evaluate(() => {
	const c = (window as unknown as { __chess: ChessHandle }).__chess;
	const s = c.activeSession.value;
	return s ? { mode: s.mode, bot: s.bot, ply: s.tree.nodes[s.cursor]!.ply } : null;
});

test('play with bot from an analysis position, bot replies, detach', async ({ page }) => {
	test.setTimeout(60_000);
	await page.goto('/');
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess);
	await page.evaluate(() => {
		const c = (window as unknown as { __chess: ChessHandle }).__chess;
		c.sessionsActions.newSession();
		c.sessionsActions.move('e2e4');
		c.sessionsActions.move('e7e5');
	});
	await page.getByRole('tab', { name: 'Engine' }).click();
	await page.getByRole('button', { name: 'Play vs bot' }).last().click();

	const dialog = page.getByRole('dialog', { name: 'Play with a bot' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByLabel('Engine')).toHaveValue('sf-lite');
	await dialog.getByRole('button', { name: /Club/ }).click();
	await expect(dialog.getByLabel('Target Elo')).toHaveValue('1500');
	await dialog.getByRole('radio', { name: 'Black' }).click();
	await dialog.getByRole('button', { name: 'Start' }).click();
	await expect(dialog).toBeHidden();

	await expect.poll(async () => (await handle(page))?.mode).toBe('bot');
	expect((await handle(page))?.bot).toMatchObject({ color: 'white', targetElo: 1500 });
	// White (bot) is to move after 1.e4 e5 → the real engine replies.
	await expect.poll(async () => (await handle(page))?.ply, { timeout: 30_000 }).toBe(3);
	await expect(page.getByLabel('Bot game')).toContainText('Your move');

	await page.getByLabel('Bot game').getByRole('button', { name: 'Detach' }).click();
	await expect.poll(async () => (await handle(page))?.mode).toBe('analysis');
	await expect(page.locator('.player-strip__mode').first()).toHaveText('Analysis');
});

import { expect, test, type Page } from '@playwright/test';

// Captured pieces in the player strips, and a finished game that can be continued after stepping back.

type Chess = {
	sessionsActions: { newSession(): unknown; move(u: string): unknown; update(p: object): unknown };
	activeSession: { value: { result?: { reason: string } } | null };
};

async function ready(page: Page): Promise<void> {
	await page.goto('/');
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess);
}

async function setup(page: Page, moves: string[]): Promise<void> {
	await page.evaluate((ms) => {
		const c = (window as unknown as { __chess: Chess }).__chess;
		c.sessionsActions.newSession();
		c.sessionsActions.update({ mode: 'local-pvp', pvp: { autoFlip: false, tabletop: false } });
		for (const m of ms) c.sessionsActions.move(m);
	}, moves);
}

/** Click a square (board shown from White's side). */
async function clickSquare(page: Page, sq: string): Promise<void> {
	const box = (await page.locator('.stage__board .board').first().boundingBox())!;
	const file = sq.charCodeAt(0) - 97;
	const rank = Number(sq[1]) - 1;
	const size = box.width / 8;
	await page.mouse.click(box.x + (file + 0.5) * size, box.y + (7 - rank + 0.5) * size);
}

test('player strips show captured pieces and the material lead', async ({ page }) => {
	await ready(page);
	// 1.e4 d5 2.exd5 Qxd5 3.Nc3 Qxg2?? 4.Bxg2 — white took a pawn + queen, black took two pawns (+8).
	await setup(page, ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5g2', 'f1g2']);
	const bottom = page.locator('.player-strip--bottom .captured');
	const top = page.locator('.player-strip--top .captured');
	await expect(bottom.locator('.captured__piece--black')).toHaveCount(2);
	await expect(bottom.locator('.captured__lead')).toHaveText('+8');
	await expect(top.locator('.captured__piece--white')).toHaveCount(2);
	await expect(top.locator('.captured__lead')).toHaveCount(0);
	await page.screenshot({ path: 'test-results/captured-strips.png' });
});

test('after mate, stepping back hides the result and play can continue to a new finish', async ({ page }) => {
	await ready(page);
	// Fool's mate: 1.f3 e5 2.g4 Qh4#
	await setup(page, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
	const banner = page.locator('.stage__result');
	await expect(banner).toContainText('Black wins');

	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('ArrowLeft'); // back to before 2...Qh4#
	await expect(banner).toHaveCount(0);

	// Black plays a different move on the board: 2...Nc6 (click-click).
	await clickSquare(page, 'b8');
	await clickSquare(page, 'c6');
	await expect.poll(() => page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.activeSession.value?.result)).toBeUndefined();
	await expect(banner).toHaveCount(0);

	// The game goes on and can finish again: 3.Nc3 Qh4# is mate on the new line.
	await page.evaluate(() => {
		const c = (window as unknown as { __chess: Chess }).__chess;
		for (const m of ['b1c3', 'd8h4']) c.sessionsActions.move(m);
	});
	await expect(banner).toContainText('Black wins');
});

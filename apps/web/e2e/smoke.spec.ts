import { expect, test } from '@playwright/test';

// Smoke: shell renders, a move on the empty board opens a session, sessions persist across reload.
test('shell renders and sessions survive reload', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('toolbar', { name: 'Game controls' })).toBeVisible();
	await page.getByRole('button', { name: 'New game' }).first().click();
	await page.getByRole('dialog', { name: 'New game' }).getByRole('button', { name: 'Start', exact: true }).click();
	await page.evaluate(() => {
		const c = (window as unknown as { __chess: { sessionsActions: { move(u: string): unknown } } }).__chess;
		c.sessionsActions.move('e2e4');
		c.sessionsActions.move('e7e5');
	});
	await expect(page.getByRole('list', { name: 'Moves' })).toContainText('e5');
	await page.waitForTimeout(500); // autosave debounce
	await page.reload();
	await expect(page.getByRole('list', { name: 'Moves' })).toContainText('e5');
});

test('routes swap the panel while the board stays mounted', async ({ page }) => {
	await page.goto('/');
	const board = page.locator('.stage__board');
	await expect(board).toBeVisible();
	// Tag the board DOM node; client-side navigation must keep the same node.
	await board.evaluate((el) => el.setAttribute('data-e2e-mark', '1'));
	await page.getByRole('tab', { name: 'Openings' }).click();
	await expect(page).toHaveURL(/\/openings$/);
	await page.evaluate(() => history.pushState({}, '', '/sessions'));
	await page.evaluate(() => dispatchEvent(new PopStateEvent('popstate')));
	await expect(page.getByRole('heading', { name: 'Open sessions', exact: true })).toBeVisible();
	await expect(page.locator('.stage__board[data-e2e-mark="1"]')).toHaveCount(1);
});

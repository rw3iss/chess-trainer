import { expect, test, type Page } from '@playwright/test';

// PLAN §9 flow 6 — theme editor: clone a board theme, change colours → the
// hero board updates → reload → the custom theme persists and stays active.
// Plus: local player-vs-player with a clock (New game modal → moves → flag).

type Chess = {
	sessionsActions: { move(u: string): unknown };
	activeSession: { value: { mode: string; clock?: { running: string | null } } | null };
	updateSettings(p: unknown): void;
};

async function goSettings(page: Page, section: string) {
	await page.goto(`/settings/${section}`);
	await expect(page.getByRole('heading', { name: section === 'theme-editor' ? 'Theme editor' : /./, level: 2 })).toBeVisible();
}

const heroLight = (page: Page) =>
	page.locator('.stage__board [role="application"]').evaluate((el) => getComputedStyle(el).getPropertyValue('--board-light').trim().toLowerCase());

test('theme editor: clone, recolour, save → board updates and persists', async ({ page }) => {
	await goSettings(page, 'theme-editor');
	await page.getByRole('button', { name: 'Clone & edit' }).click();
	const name = page.getByLabel('Theme name');
	await name.fill('Lavender');
	const hex = page.getByLabel('Hex colour');
	await hex.nth(0).fill('#e8d5f2');
	await hex.nth(0).press('Enter');
	await hex.nth(1).fill('#6a3d8f');
	await hex.nth(1).press('Enter');
	// Live preview reflects the draft before saving.
	await expect
		.poll(() => page.locator('.theme-editor__board [role="application"]').evaluate((el) => getComputedStyle(el).getPropertyValue('--board-light').trim()))
		.toBe('#e8d5f2');
	await page.getByRole('button', { name: 'Save theme' }).click();
	await expect(page.getByText('Saved “Lavender”')).toBeVisible();
	await expect(page.getByRole('list').getByText('Lavender')).toBeVisible();

	if ((page.viewportSize()?.width ?? 1440) >= 900) await expect.poll(() => heroLight(page)).toBe('#e8d5f2');

	await page.waitForTimeout(500); // settings persist debounce
	await page.reload();
	await expect(page.getByRole('list').getByText('Lavender')).toBeVisible();
	await page.goto('/');
	await expect.poll(() => heroLight(page)).toBe('#e8d5f2');

	// The custom theme shows in the Board gallery as selected.
	await page.goto('/settings/board');
	await expect(page.getByRole('radio', { name: /Lavender/ })).toHaveAttribute('aria-checked', 'true');
});

test('local 2-player game with a clock: moves press the clock, flag ends the game', async ({ page }) => {
	await page.clock.install();
	await page.goto('/');
	await page.getByRole('button', { name: 'New game' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'New game' });
	await dialog.getByRole('radio', { name: '2 players' }).click();
	await dialog.getByRole('button', { name: '1+0' }).click();
	await dialog.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(dialog).toBeHidden();

	await expect(page.getByRole('button', { name: /White clock 1:00/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /Black clock 1:00/ })).toBeVisible();

	await page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.sessionsActions.move('e2e4'));
	await expect.poll(() => page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.activeSession.value?.clock?.running)).toBe('black');
	await page.clock.runFor(5_000);
	await expect(page.getByRole('button', { name: /Black clock 0:5\d, running/ })).toBeVisible();

	// Each placement renders the clocks.
	for (const placement of ['side', 'overlay', 'top-bottom']) {
		await page.evaluate((p) => (window as unknown as { __chess: Chess }).__chess.updateSettings({ clock: { placement: p } }), placement);
		await expect(page.getByRole('button', { name: /Black clock/ })).toBeVisible();
	}

	// Black runs out of time → White wins on time.
	await page.clock.runFor(60_000);
	await expect(page.getByRole('status').filter({ hasText: 'White wins' })).toContainText('timeout');
	await expect(page.getByRole('button', { name: /Black clock 0:00\.0, flagged/ })).toBeVisible();
});

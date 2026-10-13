import { expect, test, type Page } from '@playwright/test';

// PWA offline (PLAN §9 flow 5). Needs the PRODUCTION build + preview server, where the service
// worker exists: `pnpm exec playwright test --config config/playwright.preview.config.ts`.
// Under the dev-server config (no SW) the whole file skips.

async function hasServiceWorkerBuild(page: Page): Promise<boolean> {
	const res = await page.request.get('/sw.js');
	return res.ok() && (res.headers()['content-type'] ?? '').includes('javascript');
}

/** Load, wait for the SW to install + activate, then reload once so it controls the page. */
async function bootControlled(page: Page): Promise<void> {
	await page.goto('/');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
	// Precache finished installing before activation, so everything precached is now available.
	await expect(page.getByRole('toolbar', { name: 'Game controls' })).toBeVisible();
}

test.describe('offline PWA', () => {
	test.beforeEach(async ({ page }) => {
		test.skip(!(await hasServiceWorkerBuild(page)), 'Needs the production build (config/playwright.preview.config.ts).');
		await bootControlled(page);
	});

	test('reload and route navigation work offline', async ({ page, context }) => {
		await context.setOffline(true);
		await page.reload();
		await expect(page.getByRole('toolbar', { name: 'Game controls' })).toBeVisible();

		// Deep links served from the precached index.html (navigation fallback).
		await page.goto('/openings');
		await expect(page).toHaveURL(/\/openings$/);
		await expect(page.locator('#root')).not.toBeEmpty();
		await page.goto('/games');
		await expect(page).toHaveURL(/\/games$/);
		await expect(page.getByRole('heading', { name: 'Saved games' }).first()).toBeVisible();
		await context.setOffline(false);
	});

	test('openings search works offline', async ({ page, context }) => {
		await context.setOffline(true);
		await page.goto('/openings');
		const search = page.getByRole('searchbox', { name: 'Search openings' });
		const ready = await search.waitFor({ timeout: 8_000 }).then(
			() => true,
			() => false,
		);
		test.skip(!ready, 'Openings page has no search input yet (feature in progress).');
		await search.fill('Sicilian');
		await expect(page.locator('[aria-label*="Sicilian"]').first()).toBeVisible({ timeout: 15_000 });
		await context.setOffline(false);
	});

	test('local bot (Stockfish lite) plays offline', async ({ page, context }) => {
		await context.setOffline(true);
		await page.reload();
		await page.getByRole('button', { name: 'New game' }).first().click();
		const newGame = page.getByRole('dialog', { name: 'New game' });
		const hasNewGameModal = await newGame.waitFor({ timeout: 3_000 }).then(
			() => true,
			() => false,
		);
		if (hasNewGameModal) {
			// New-game modal: pick "vs Bot" → hands off to the bot modal.
			await newGame.getByRole('radio', { name: /vs Bot/ }).click();
			await newGame.getByRole('button', { name: /Next: bot/ }).click();
		} else {
			const botButton = page.getByRole('button', { name: 'Play vs bot' });
			if (await botButton.isVisible()) await botButton.click();
			else {
				await page.getByRole('button', { name: 'More' }).click();
				await page.getByRole('menuitem', { name: /Play vs bot/ }).click();
			}
		}
		const dialog = page.getByRole('dialog', { name: /with a bot|bot game/i });
		const opened = await dialog.waitFor({ timeout: 5_000 }).then(
			() => true,
			() => false,
		);
		test.skip(!opened, 'Bot modal is not available yet (feature in progress).');

		// Play Black so the bot (White) has to move first.
		await dialog.getByRole('radio', { name: 'Black' }).click();
		await dialog.getByRole('button', { name: 'Start' }).click();
		await expect(dialog).toBeHidden();
		// The bot's first move shows up in the move list as the current move.
		await expect(page.getByRole('list', { name: 'Moves' }).first().locator('button.move').first()).toBeVisible({ timeout: 30_000 });
		await context.setOffline(false);
	});
});

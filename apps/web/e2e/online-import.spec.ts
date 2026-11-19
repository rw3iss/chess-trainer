import { expect, test, type Page } from '@playwright/test';

// Import games from Lichess / Chess.com (Games → Import → "Lichess / Chess.com"). Both sites are mocked.
const pgn = (white: string, black: string, date: string) =>
	`[Event "Rated Blitz game"]\n[Site "x"]\n[White "${white}"]\n[Black "${black}"]\n[UTCDate "${date}"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0\n`;

async function mockSites(page: Page) {
	await page.route('https://lichess.org/api/user/**', (r) => r.fulfill({ json: { id: 'alice', count: { all: 3, rated: 3 } } }));
	await page.route('https://lichess.org/api/games/user/**', (r) =>
		r.fulfill({
			contentType: 'application/x-ndjson',
			body: [
				{ id: 'li1', pgn: pgn('alice', 'bob', '2026.11.02'), lastMoveAt: 3000 },
				{ id: 'li2', pgn: pgn('carol', 'alice', '2026.11.01'), lastMoveAt: 2000 },
				{ id: 'li3', pgn: pgn('alice', 'dave', '2026.10.30'), lastMoveAt: 1000 },
			]
				.map((g) => JSON.stringify(g))
				.join('\n'),
		}),
	);
	const base = 'https://api.chess.com/pub/player/bobby/games';
	await page.route('https://api.chess.com/pub/player/*/games/archives', (r) => r.fulfill({ json: { archives: [`${base}/2026/10`, `${base}/2026/11`] } }));
	await page.route('https://api.chess.com/pub/player/*/games/2026/11', (r) =>
		r.fulfill({ json: { games: [{ url: 'https://www.chess.com/game/live/11', pgn: pgn('bobby', 'erin', '2026.11.05'), end_time: 1_762_300_000, rated: true, rules: 'chess' }] } }),
	);
	await page.route('https://api.chess.com/pub/player/*/games/2026/10', (r) =>
		r.fulfill({ json: { games: [{ url: 'https://www.chess.com/game/live/10', pgn: pgn('frank', 'bobby', '2026.10.05'), end_time: 1_759_600_000, rated: true, rules: 'chess' }] } }),
	);
}

async function openOnlineImport(page: Page) {
	await page.goto('/games');
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess, null, { timeout: 30_000 });
	await page.getByRole('button', { name: /^Import/ }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Import' });
	await dialog.getByRole('radio', { name: 'Lichess / Chess.com' }).click();
	return dialog;
}

test('imports Lichess and Chess.com games; a second import skips them', async ({ page }) => {
	await mockSites(page);
	let dialog = await openOnlineImport(page);
	await dialog.getByLabel('Username').fill('alice');
	await dialog.getByRole('button', { name: 'Import games' }).click();
	await expect(dialog.getByText('Imported 3 games', { exact: true })).toBeVisible({ timeout: 15_000 });

	// Chess.com, all games.
	await dialog.getByLabel('Site').selectOption('chesscom');
	await dialog.getByLabel('Username').fill('bobby');
	await dialog.getByRole('radio', { name: 'All' }).click();
	await dialog.getByRole('button', { name: 'Import games' }).click();
	await expect(dialog.getByText('Imported 2 games', { exact: true })).toBeVisible({ timeout: 15_000 });
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	const list = page.getByRole('list', { name: 'Saved games' }).or(page.locator('.games-page__list'));
	await expect(page.getByText('alice vs bob, 2026-11-02')).toBeVisible();
	await expect(page.getByText('bobby vs erin, 2026-11-05')).toBeVisible();
	await expect(list).toBeVisible();
	await expect(page.locator('.games-page__sub')).toHaveText('5 games');

	// Again: everything is already here.
	dialog = await openOnlineImport(page);
	await dialog.getByLabel('Username').fill('alice');
	await dialog.getByRole('button', { name: 'Import games' }).click();
	await expect(dialog.getByText('Imported 0 games (3 already here)')).toBeVisible({ timeout: 15_000 });
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(page.locator('.games-page__sub')).toHaveText('5 games');
});

test('unknown players and the empty-state shortcut', async ({ page }) => {
	await page.route('https://lichess.org/api/user/**', (r) => r.fulfill({ status: 404, body: '' }));
	await page.route('https://lichess.org/api/games/user/**', (r) => r.fulfill({ status: 404, body: '' }));
	await page.goto('/games');
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess, null, { timeout: 30_000 });
	await page.getByRole('button', { name: 'Import from Lichess or Chess.com' }).click();
	const dialog = page.getByRole('dialog', { name: 'Import' });
	await expect(dialog.getByRole('radio', { name: 'Lichess / Chess.com' })).toHaveAttribute('aria-checked', 'true');
	await dialog.getByLabel('Username').fill('nobody_here');
	await dialog.getByRole('button', { name: 'Import games' }).click();
	await expect(dialog.getByText('No Lichess player named “nobody_here”.')).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';

// PLAN §9 flow 1: search → ★ → favorites filter → Load → play (fast) → pause → back 3 → Fork → new tab active.
interface ChessHandle {
	activeSession: { value: { id: string; cursor: string; source: { kind: string; openingId?: string }; tree: { nodes: Record<string, { ply: number }> } } | null };
	sessionCount: { value: number };
}

const cursorPly = (page: Page) =>
	page.evaluate(() => {
		const s = (window as unknown as { __chess: ChessHandle }).__chess.activeSession.value;
		return s ? s.tree.nodes[s.cursor]!.ply : -1;
	});
const active = (page: Page) =>
	page.evaluate(() => {
		const c = (window as unknown as { __chess: ChessHandle }).__chess;
		const s = c.activeSession.value;
		return { id: s?.id ?? null, kind: s?.source.kind ?? null, openingId: s?.source.openingId ?? null, count: c.sessionCount.value };
	});

test('openings: search, favorite, load, play, step back, fork', async ({ page }) => {
	await page.goto('/openings');
	const search = page.getByRole('searchbox', { name: 'Search openings' });
	await expect(page.locator('.opening-row').first()).toBeVisible({ timeout: 30_000 });

	await search.fill('sicilian najdorf');
	const first = page.locator('.opening-row').first();
	await expect(first.getByRole('button', { name: 'Sicilian Defense: Najdorf Variation, B90' })).toBeVisible();
	const openingId = await first.getAttribute('data-opening-id');

	await first.getByRole('button', { name: /^Add .* to favorites$/ }).click();
	await expect(first.getByRole('button', { name: /^Remove .* from favorites$/ })).toBeVisible();

	await page.getByRole('button', { name: 'Favorites only' }).first().click();
	await expect(page).toHaveURL(/fav=1/);
	await expect(page.getByText('1 opening', { exact: true })).toBeVisible();

	// Desktop: the preview card shows the selection; mobile: the row expands inline.
	await page.locator('.opening-row__main').first().click();
	await page.getByRole('button', { name: 'Load', exact: true }).click();
	await expect(page).toHaveURL(/\/$/);
	expect(await active(page)).toMatchObject({ kind: 'opening', openingId, count: 1 });

	// Play at fast, then pause.
	await page.getByRole('button', { name: /^Playback speed/ }).click();
	await page.getByRole('menuitemcheckbox', { name: /^Fast/ }).or(page.getByRole('menuitem', { name: /^Fast/ })).click();
	await page.getByRole('button', { name: 'Play (Space)' }).click();
	await expect.poll(() => cursorPly(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(6);
	await page.getByRole('button', { name: 'Pause (Space)' }).click();
	const pausedAt = await cursorPly(page);
	await page.waitForTimeout(800);
	expect(await cursorPly(page)).toBe(pausedAt);

	// Step back 3.
	for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Previous (←)' }).click();
	expect(await cursorPly(page)).toBe(pausedAt - 3);

	// Fork → a new active session at that ply.
	const before = await active(page);
	const forkButton = page.getByRole('button', { name: 'Fork from here' });
	if (await forkButton.isVisible()) await forkButton.click();
	else {
		await page.getByRole('button', { name: 'More', exact: true }).click();
		await page.getByRole('menuitem', { name: 'Fork from here' }).click();
	}
	await expect.poll(() => active(page)).toMatchObject({ kind: 'fork', count: 2 });
	const after = await active(page);
	expect(after.id).not.toBe(before.id);
	expect(await cursorPly(page)).toBe(pausedAt - 3);
});

test('openings: SAN search, URL state survives back/forward, detail page', async ({ page }) => {
	await page.goto('/openings?q=e4+c5+Nf3&sort=length');
	await expect(page.locator('.opening-row').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('.opening-row__moves').first()).toContainText('1.e4 c5 2.Nf3');
	await page.getByRole('button', { name: 'Black', exact: true }).or(page.getByRole('radio', { name: 'Black' })).first().click();
	await expect(page).toHaveURL(/color=black/);
	await page.goBack();
	await expect(page).not.toHaveURL(/color=black/);
	await expect(page.getByRole('searchbox', { name: 'Search openings' })).toHaveValue('e4 c5 Nf3');

	await page.locator('.opening-row__main').first().click();
	await page.getByRole('button', { name: 'Details' }).first().click();
	await expect(page).toHaveURL(/\/openings\/[0-9a-z]+$/);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Continuations' }).or(page.locator('.continuations')).first()).toBeVisible();
});

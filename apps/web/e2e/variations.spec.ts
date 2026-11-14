import { expect, test, type Page } from '@playwright/test';

// Moves panel "Variations": load an opening → see the openings it is built on and its
// variations → expand one → load a variation from the panel.
interface ChessHandle {
	activeSession: { value: { source: { kind: string; openingId?: string } } | null };
}

const openingIdOf = (page: Page) =>
	page.evaluate(() => (window as unknown as { __chess: ChessHandle }).__chess.activeSession.value?.source.openingId ?? null);

test('variations section: built-on chain, expand, load a variation', async ({ page }, info) => {
	await page.goto('/openings?q=sicilian%20najdorf');
	const first = page.locator('.opening-row').first();
	await expect(first).toBeVisible({ timeout: 30_000 });
	await page.locator('.opening-row__main').first().click();
	await page.getByRole('button', { name: 'Load', exact: true }).click();
	await expect(page).toHaveURL(/\/$/);
	const najdorf = await openingIdOf(page);

	const section = page.getByRole('region', { name: 'Opening variations' });
	await expect(section).toBeVisible();
	await expect(section.locator('.opening-vars__crumb').first()).toHaveText("King's Pawn Game");
	await expect(section.locator('.opening-vars__crumb--current')).toContainText('Najdorf Variation');

	const rows = section.locator('.opening-vars__list').first().locator(':scope > .opening-vars__item');
	await expect(rows.first()).toBeVisible();
	expect(await rows.count()).toBeGreaterThanOrEqual(5);

	// Expand the first variation that has sub-variations.
	const toggle = section.locator('.opening-vars__toggle[aria-expanded="false"]').first();
	await toggle.click();
	await expect(section.locator('.opening-vars__list--nested').first()).toBeVisible();
	await page.screenshot({ path: `test-results/variations-${info.project.name}.png`, fullPage: false });

	// Load a nested variation → the session switches to it.
	await section.locator('.opening-vars__list--nested .opening-vars__load').first().click();
	await expect.poll(() => openingIdOf(page)).not.toBe(najdorf);
	// The new opening's section now shows the Najdorf in its built-on chain.
	await expect(section.locator('.opening-vars__crumb').filter({ hasText: 'Najdorf' }).first()).toBeVisible();
});

test('keep position: a variation loads at the same move; off loads at the start', async ({ page }) => {
	const cursorPly = () =>
		page.evaluate(() => {
			const c = (window as unknown as { __chess: { activeSession: { value: { cursor: string; tree: { nodes: Record<string, { ply: number }> } } | null } } }).__chess;
			const s = c.activeSession.value;
			return s ? s.tree.nodes[s.cursor]!.ply : -1;
		});
	await page.goto('/openings?q=sicilian%20najdorf');
	await page.locator('.opening-row__main').first().click({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Load', exact: true }).click();
	await expect(page).toHaveURL(/\/$/);
	const section = page.getByRole('region', { name: 'Opening variations' });
	const keep = section.getByRole('switch', { name: 'Keep position' });

	// Step to move 7 (ply 7) of the Najdorf line, then load a variation with "Keep position" on.
	for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Next (→)' }).click();
	expect(await cursorPly()).toBe(7);
	await keep.click();
	await expect(keep).toHaveAttribute('aria-checked', 'true');
	await section.locator('.opening-vars__load').first().click();
	await expect.poll(cursorPly).toBe(7);

	// Off: the next variation loads at the start.
	await keep.click();
	await expect(keep).toHaveAttribute('aria-checked', 'false');
	await section.locator('.opening-vars__load').first().click();
	await expect.poll(cursorPly).toBe(0);
});

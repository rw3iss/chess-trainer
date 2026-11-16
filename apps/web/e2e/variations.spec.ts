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
	await expect(page).toHaveURL(/\/openings\/[a-z0-9-]+$/);
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

test('keep position (default on, persisted): a variation loads at the same move; off loads at the start', async ({ page }) => {
	const cursorPly = () =>
		page.evaluate(() => {
			const c = (window as unknown as { __chess: { activeSession: { value: { cursor: string; tree: { nodes: Record<string, { ply: number }> } } | null } } }).__chess;
			const s = c.activeSession.value;
			return s ? s.tree.nodes[s.cursor]!.ply : -1;
		});
	await page.goto('/openings?q=sicilian%20najdorf');
	await page.locator('.opening-row__main').first().click({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Load', exact: true }).click();
	await expect(page).toHaveURL(/\/openings\/[a-z0-9-]+$/);
	const section = page.getByRole('region', { name: 'Opening variations' });
	const keep = section.getByRole('switch', { name: 'Keep position' });

	// Step to move 7 (ply 7) of the Najdorf line, then load a variation with "Keep position" on.
	for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Next (→)' }).click();
	expect(await cursorPly()).toBe(7);
	await expect(keep).toHaveAttribute('aria-checked', 'true'); // on by default
	await section.locator('.opening-vars__load').first().click();
	await expect.poll(cursorPly).toBe(7);

	// Off: the next variation loads at the start.
	await keep.click();
	await expect(keep).toHaveAttribute('aria-checked', 'false');
	await section.locator('.opening-vars__load').first().click();
	await expect.poll(cursorPly).toBe(0);

	// The choice is saved and restored after a reload (wait out the session-persist debounce).
	await page.waitForTimeout(500);
	await page.reload();
	await expect(page.getByRole('region', { name: 'Opening variations' }).getByRole('switch', { name: 'Keep position' })).toHaveAttribute('aria-checked', 'false');
});

test('the Moves panel follows manual moves: title, built-on, next openings, custom', async ({ page }) => {
	type Node = { id: string; ply: number; children: string[] };
	type S = { title: string; cursor: string; tree: { nodes: Record<string, Node> } };
	type Handle = {
		openingIndex: { value: { all(): { name: string; uci: string[]; source: string }[] } | null };
		activeSession: { value: S | null };
		sessionsActions: { fromOpening(e: unknown): S; goto(id: string): unknown; move(u: string): unknown };
	};
	const najdorf = 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6';
	await page.goto('/');
	await page.waitForFunction(() => !!(window as unknown as { __chess?: Handle }).__chess?.openingIndex.value, null, { timeout: 30_000 });
	await page.evaluate((line) => {
		const c = (window as unknown as { __chess: Handle }).__chess;
		const e = c.openingIndex.value!.all().find((o) => o.source === 'lichess' && o.uci.join(' ') === line)!;
		const s = c.sessionsActions.fromOpening(e);
		let n = s.tree.nodes.root!;
		while (n.children.length) n = s.tree.nodes[n.children[0]!]!;
		c.sessionsActions.goto(n.id);
	}, najdorf);
	const state = () =>
		page.evaluate(() => {
			const s = (window as unknown as { __chess: Handle }).__chess.activeSession.value!;
			return { title: s.title, ply: s.tree.nodes[s.cursor]!.ply };
		});
	const move = (u: string) => page.evaluate((m) => (window as unknown as { __chess: Handle }).__chess.sessionsActions.move(m), u);
	const header = page.locator('.opening-header');
	const section = page.getByRole('region', { name: 'Opening variations' });

	await expect.poll(async () => (await state()).title).toBe('Sicilian Defense: Najdorf Variation');
	await expect(section.locator('.opening-vars__head')).toContainText('Variations');

	// A move into another named line: title, header and built-on chain follow it.
	await move('h2h3');
	await expect.poll(async () => (await state()).title).toBe('Sicilian Defense: Najdorf Variation, Adams Attack');
	await expect(header).toContainText('Adams Attack');
	await expect(section.locator('.opening-vars__crumb--current')).toContainText('Adams Attack');
	await expect(section.locator('.opening-vars__crumb').filter({ hasText: 'Najdorf Variation' }).first()).toBeVisible();

	// An own move out of book: marked custom everywhere.
	await move('h8g8');
	await expect.poll(async () => (await state()).title).toBe('Sicilian Defense: Najdorf Variation, Adams Attack (custom)');
	await expect(header.locator('.opening-header__custom')).toHaveText('custom +1');
	await expect(section.locator('.opening-vars__crumb--custom')).toHaveText('custom +1');
	await expect(section.locator('.opening-vars__empty')).toContainText('Out of book');

	// Back at move 6, a different named move (6.Bg5): its variations are listed;
	// clicking one at the end of the line loads it and plays its next move.
	const back = await page.evaluate(() => {
		const s = (window as unknown as { __chess: Handle }).__chess.activeSession.value!;
		return Object.values(s.tree.nodes).find((n) => n.ply === 10)!.id;
	});
	await page.evaluate((id) => (window as unknown as { __chess: Handle }).__chess.sessionsActions.goto(id), back);
	await move('c1g5');
	const rows = section.locator('.opening-vars__list').first().locator(':scope > .opening-vars__item');
	await expect(section.locator('.opening-vars__head')).toContainText('Variations');
	await expect(rows.first()).toBeVisible();
	const before = (await state()).ply;
	await section.locator('.opening-vars__load').first().click();
	await expect.poll(async () => (await state()).ply).toBe(before + 1);
});

test('flip board (default on, persisted): off keeps the board side when a variation loads', async ({ page }) => {
	const orientation = () =>
		page.evaluate(() => (window as unknown as { __chess: { activeSession: { value: { orientation: string } | null } } }).__chess.activeSession.value?.orientation);
	await page.goto('/openings?q=sicilian%20najdorf');
	await page.locator('.opening-row__main').first().click({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Load', exact: true }).click();
	await expect(page).toHaveURL(/\/openings\/[a-z0-9-]+$/);
	expect(await orientation()).toBe('black'); // the Najdorf is a Black opening
	const section = page.getByRole('region', { name: 'Opening variations' });
	const flip = section.getByRole('switch', { name: 'Flip board' });
	await expect(flip).toHaveAttribute('aria-checked', 'true');

	// Off: a White variation (6.Bg5 lines are White's) still loads with Black at the bottom.
	await flip.click();
	await expect(flip).toHaveAttribute('aria-checked', 'false');
	const white = section.locator('.opening-vars__load').filter({ hasText: 'Bg5' }).first();
	await white.click();
	await expect.poll(orientation).toBe('black');

	// On again: loading turns the board to the opening's side.
	await flip.click();
	await page.goto('/openings?q=ruy%20lopez');
	await page.locator('.opening-row__main').first().click({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Load', exact: true }).click();
	await expect.poll(orientation).toBe('white');

	// Off is saved and restored after a reload.
	await page.getByRole('region', { name: 'Opening variations' }).getByRole('switch', { name: 'Flip board' }).click();
	await page.waitForTimeout(500);
	await page.reload();
	await expect(page.getByRole('region', { name: 'Opening variations' }).getByRole('switch', { name: 'Flip board' })).toHaveAttribute('aria-checked', 'false');
});

test('clear board: start position, no moves, no opening; variations list the openings from the start; undo', async ({ page }) => {
	type S = { title: string; source: { kind: string }; tree: { nodes: Record<string, { children: string[] }> } };
	const state = () =>
		page.evaluate(() => {
			const s = (window as unknown as { __chess: { activeSession: { value: S | null } } }).__chess.activeSession.value!;
			return { kind: s.source.kind, moves: s.tree.nodes.root!.children.length, title: s.title };
		});
	await page.goto('/openings?q=sicilian%20najdorf');
	await page.locator('.opening-row__main').first().click({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Load', exact: true }).click();
	await expect(page).toHaveURL(/\/openings\/[a-z0-9-]+$/);
	const clear = page.getByRole('button', { name: 'Clear board' });
	await expect(clear).toBeEnabled();

	await clear.click();
	await expect.poll(state).toMatchObject({ kind: 'new', moves: 0 });
	await expect(page.locator('.opening-header')).toContainText('Starting position');
	await expect(clear).toBeDisabled();
	const section = page.getByRole('region', { name: 'Opening variations' });
	await expect(section.locator('.opening-vars__head')).toContainText('Openings');
	await expect(section.locator('.opening-vars__crumb')).toHaveCount(0);
	expect(await section.locator('.opening-vars__list').first().locator(':scope > .opening-vars__item').count()).toBeGreaterThanOrEqual(5);

	// Undo brings the opening back.
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(state).toMatchObject({ kind: 'opening', title: 'Sicilian Defense: Najdorf Variation' });
});

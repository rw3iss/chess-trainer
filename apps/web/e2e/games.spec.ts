import { expect, test, type Page } from '@playwright/test';

// PLAN §9 flows 3 (save / overwrite / save-as / reload) and 4 (browse while playback runs).

type Chess = {
	sessionsActions: { newSession(): unknown; move(u: string): unknown; toStart(): unknown };
	activeSession: { value: { id: string; cursor: string; savedGameId?: string; dirty: boolean; tree: { nodes: Record<string, { ply: number; san: string }> } } | null };
	savedGames: { value: Array<{ id: string; name: string; revision: number }> };
	playbackActions: { play(): unknown; setSpeed(s: string): void };
	playback: { isPlaying(id: string): boolean };
};

async function chess<T>(page: Page, fn: (c: Chess) => T): Promise<T> {
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess);
	return page.evaluate(`(${fn.toString()})(window.__chess)`) as Promise<T>;
}

/** Client-side navigation (keeps the app — and the board — mounted). */
async function navigate(page: Page, path: string): Promise<void> {
	await page.evaluate((p) => {
		history.pushState({}, '', p);
		dispatchEvent(new PopStateEvent('popstate'));
	}, path);
}

async function newGameWith(page: Page, moves: string[]): Promise<void> {
	await page.goto('/');
	await chess(page, () => true);
	await page.evaluate((ms) => {
		const c = (window as unknown as { __chess: Chess }).__chess;
		c.sessionsActions.newSession();
		for (const m of ms) c.sessionsActions.move(m);
	}, moves);
}

test('flow 3: save → edit → save (overwrite) → save as new → both in Games → reload restores', async ({ page }) => {
	await newGameWith(page, ['e2e4', 'c7c5']);

	// First save opens the modal (always "new").
	await page.keyboard.press('Control+s');
	const dialog = page.getByRole('dialog', { name: 'Save new game' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('radio')).toHaveCount(0);
	await dialog.getByLabel('Name').fill('Flow3 Sicilian');
	await dialog.getByRole('button', { name: 'Save game' }).click();
	await expect(dialog).toBeHidden();
	const first = await chess(page, (c) => ({ id: c.activeSession.value!.savedGameId, n: c.savedGames.value.length }));
	expect(first.n).toBe(1);

	// Edit → Ctrl+S overwrites in place (toast, no modal).
	await page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.sessionsActions.move('g1f3'));
	await expect.poll(() => chess(page, (c) => c.activeSession.value!.dirty)).toBe(true);
	await page.keyboard.press('Control+s');
	await expect(page.getByText('Saved “Flow3 Sicilian”')).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	const afterOverwrite = await chess(page, (c) => c.savedGames.value.map((g) => ({ id: g.id, rev: g.revision })));
	expect(afterOverwrite).toEqual([{ id: first.id, rev: 1 }]);

	// Save as new copy.
	await page.evaluate(() => (window as unknown as { __chess: Chess }).__chess.sessionsActions.move('d7d6'));
	await page.keyboard.press('Control+Shift+S');
	const asDialog = page.getByRole('dialog', { name: 'Save game' });
	await expect(asDialog.getByRole('radio', { name: /Overwrite “Flow3 Sicilian”/ })).toBeVisible();
	await expect(asDialog.getByRole('radio', { name: /Save as new copy/ })).toHaveAttribute('aria-checked', 'true');
	await asDialog.getByLabel('Name').fill('Flow3 Najdorf branch');
	await asDialog.getByRole('button', { name: 'Save copy' }).click();
	await expect(asDialog).toBeHidden();

	// Both in Games.
	await navigate(page, '/games');
	const list = page.getByRole('list', { name: 'Saved games' });
	await expect(list.getByRole('article', { name: 'Flow3 Sicilian' })).toBeVisible();
	await expect(list.getByRole('article', { name: 'Flow3 Najdorf branch' })).toBeVisible();

	// Reload → games and the session (linked to the copy, with all moves) restored.
	await page.waitForTimeout(500); // autosave debounce
	await page.reload();
	await expect(page.getByRole('list', { name: 'Saved games' }).getByRole('article')).toHaveCount(2);
	await navigate(page, '/');
	await expect(page.getByRole('list', { name: 'Moves' })).toContainText('d6');
	const restored = await chess(page, (c) => {
		const s = c.activeSession.value!;
		return { linkedTo: c.savedGames.value.find((g) => g.id === s.savedGameId)?.name, dirty: s.dirty };
	});
	expect(restored).toEqual({ linkedTo: 'Flow3 Najdorf branch', dirty: false });
});

test('flow 4: browsing Openings / Games / Settings keeps playback running with the right position', async ({ page }) => {
	const line = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6'];
	await newGameWith(page, line);
	await page.evaluate(() => {
		const c = (window as unknown as { __chess: Chess }).__chess;
		c.sessionsActions.toStart();
		c.playbackActions.setSpeed('fast');
		c.playbackActions.play();
	});
	const ply = () => chess(page, (c) => c.activeSession.value!.tree.nodes[c.activeSession.value!.cursor]!.ply);
	const board = page.locator('.stage__board');
	await board.evaluate((el) => el.setAttribute('data-e2e-mark', '1'));

	for (const path of ['/openings', '/games', '/settings/app']) {
		const before = await ply();
		await navigate(page, path);
		await page.waitForTimeout(600);
		expect(await ply()).toBeGreaterThan(before);
	}
	await expect(page.locator('.stage__board[data-e2e-mark="1"]')).toHaveCount(1);

	// Back on the board: playback either still running or finished at the line end; move list matches the cursor.
	await navigate(page, '/');
	await expect.poll(ply, { timeout: 10_000 }).toBe(line.length);
	const san = await chess(page, (c) => c.activeSession.value!.tree.nodes[c.activeSession.value!.cursor]!.san);
	await expect(page.getByRole('list', { name: 'Moves' }).locator('[aria-current="step"]')).toContainText(san);
});

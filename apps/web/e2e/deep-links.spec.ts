import { expect, test, type Page } from '@playwright/test';

// Deep links: /openings/<slug> loads an opening on the board; the Share button copies the
// opening's link, or a reversible line code (/openings/~…) for custom moves; bad links → the list.
type Node = { id: string; children: string[]; uci?: string };
type S = { id: string; title: string; source: { kind: string; openingId?: string }; cursor: string; tree: { nodes: Record<string, Node> } };
type Handle = {
	activeSession: { value: S | null };
	sessionsActions: { move(u: string): unknown; goto(id: string): unknown };
};
const NAJDORF = 'sicilian-defense-najdorf-variation';

const active = (page: Page) => page.evaluate(() => (window as unknown as { __chess: Handle }).__chess.activeSession.value);
/** Moves of the active session's main line. */
const mainLine = (page: Page) =>
	page.evaluate(() => {
		const s = (window as unknown as { __chess: Handle }).__chess.activeSession.value!;
		const out: string[] = [];
		let n = s.tree.nodes.root!;
		while (n.children.length) {
			n = s.tree.nodes[n.children[0]!]!;
			out.push(n.uci!);
		}
		return out;
	});
const toEnd = (page: Page) =>
	page.evaluate(() => {
		const c = (window as unknown as { __chess: Handle }).__chess;
		const s = c.activeSession.value!;
		let n = s.tree.nodes.root!;
		while (n.children.length) n = s.tree.nodes[n.children[0]!]!;
		c.sessionsActions.goto(n.id);
	});
const waitHandle = (page: Page) => page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess, null, { timeout: 30_000 });

test.beforeEach(async ({ context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('a slug link loads the opening; share copies it; custom moves share a line code that loads back', async ({ page }) => {
	await page.goto(`/openings/${NAJDORF}`);
	await waitHandle(page);
	await expect.poll(async () => (await active(page))?.title).toBe('Sicilian Defense: Najdorf Variation');
	await expect(page.getByRole('tab', { name: 'Moves' })).toHaveAttribute('aria-selected', 'true');

	// The opening's own moves → its link.
	await toEnd(page);
	const share = page.locator('.opening-header__share');
	await share.click();
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/openings/${NAJDORF}$`));

	// Custom moves: the address stays; share gives a line code.
	await page.evaluate(() => {
		const c = (window as unknown as { __chess: Handle }).__chess;
		c.sessionsActions.move('h2h3');
		c.sessionsActions.move('h7h5');
	});
	await expect(page).toHaveURL(new RegExp(`/openings/${NAJDORF}$`));
	await share.click();
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/openings\/~[A-Za-z0-9_-]+$/);
	const url = await page.evaluate(() => navigator.clipboard.readText());
	const line = await mainLine(page);

	// The code link rebuilds the same moves in a fresh browser.
	const other = await page.context().newPage();
	await other.goto(url);
	await waitHandle(other);
	await expect.poll(() => mainLine(other)).toEqual(line);
	await other.close();
});

test('a line code that is exactly an opening shares the opening link', async ({ page }) => {
	await page.goto('/');
	await waitHandle(page);
	await page.waitForFunction(() => !!(window as unknown as { __chess: { openingIndex: { value: unknown } } }).__chess.openingIndex.value, null, { timeout: 30_000 });
	await page.evaluate(() => {
		const c = (window as unknown as { __chess: Handle & { sessionsActions: { newSession(): unknown } } }).__chess;
		c.sessionsActions.newSession();
		for (const m of ['e2e4', 'c7c5']) c.sessionsActions.move(m);
	});
	await page.locator('.opening-header__share').click();
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/openings\/sicilian-defense$/);
});

test('unknown slugs and bad codes go to the openings list with a message', async ({ page }) => {
	await page.goto('/openings/no-such-opening-xyz');
	await expect(page).toHaveURL(/\/openings\?missing=no-such-opening-xyz$/, { timeout: 30_000 });
	await expect(page.getByRole('alert').filter({ hasText: 'No opening found' })).toBeVisible();
	await page.goto('/openings/~zz!!');
	await expect(page.getByRole('alert').filter({ hasText: 'invalid' })).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Dismiss' }).click();
	await expect(page.getByRole('alert').filter({ hasText: 'invalid' })).toHaveCount(0);
});

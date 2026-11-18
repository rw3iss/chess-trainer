import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// Import a position: a pasted FEN, or a board image read in the browser (grid → ONNX classifier).
// Image fixtures + expected placements: e2e/fixtures/board-images/fixtures.json (tools/board-vision).
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, 'fixtures/board-images');

interface Fixture {
	file: string;
	placement: string;
	orientation: 'white' | 'black';
	lastMove?: [string, string];
	source: string;
}

type S = { title: string; source: { kind: string }; tree: { nodes: Record<string, { fen: string }> } };
const activeRootFen = (page: Page) =>
	page.evaluate(() => {
		const s = (window as unknown as { __chess: { activeSession: { value: S | null } } }).__chess.activeSession.value!;
		return { fen: s.tree.nodes.root!.fen, title: s.title, kind: s.source.kind };
	});

async function openImport(page: Page) {
	await page.goto('/games');
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess, null, { timeout: 30_000 });
	await page.getByRole('button', { name: /^Import/ }).first().click();
	await expect(page.getByRole('dialog', { name: 'Import' })).toBeVisible();
}

/** The editor's FEN field. */
const fenField = (page: Page) => page.getByRole('dialog').getByLabel('FEN', { exact: true });

test('a pasted FEN opens the position editor, then a new unsaved game on the board', async ({ page }) => {
	const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
	await openImport(page);
	await page.getByRole('radio', { name: 'Paste' }).click();
	await page.getByLabel('PGN, FEN, or paste an image').fill(fen);
	await expect(fenField(page)).toHaveValue(fen.split(' ')[0]!, { timeout: 5_000 }).catch(async () => {
		// The field may show the full FEN.
		await expect(fenField(page)).toHaveValue(fen);
	});
	const open = page.getByRole('button', { name: 'Open on board' });
	await expect(open).toBeEnabled();
	await open.click();
	await expect(page).toHaveURL(/\/$/);
	await expect.poll(() => activeRootFen(page)).toMatchObject({ fen, kind: 'import', title: 'Position from FEN' });
});

test('an invalid position cannot be opened', async ({ page }) => {
	await openImport(page);
	await page.getByRole('radio', { name: 'Paste' }).click();
	await page.getByLabel('PGN, FEN, or paste an image').fill('8/8/8/8/8/8/8/8 w - - 0 1');
	await expect(page.getByRole('button', { name: 'Open on board' })).toBeDisabled();
	await expect(page.getByRole('dialog').getByRole('alert').first()).toContainText(/empty|king/i);
});

const fixtures: Fixture[] = existsSync(join(FIXTURES, 'fixtures.json')) ? (JSON.parse(readFileSync(join(FIXTURES, 'fixtures.json'), 'utf8')) as Fixture[]) : [];

test.describe('board images', () => {
	test.skip(!fixtures.length, 'no image fixtures');
	// Model + ORT wasm load on first use.
	test.setTimeout(90_000);

	test('board images are read into the editor (placement, orientation)', async ({ page }, info) => {
		test.skip(info.project.name === 'mobile', 'same code path as desktop; one run is enough');
		await openImport(page);
		const input = page.getByRole('dialog').locator('input[type="file"]');
		const misses: string[] = [];
		for (const fx of fixtures) {
			await input.setInputFiles(join(FIXTURES, fx.file));
			await expect(page.getByText(/Board read in \d+ ms/)).toBeVisible({ timeout: 60_000 });
			const got = ((await fenField(page).inputValue()) || '').split(' ')[0];
			if (got !== fx.placement) misses.push(`${fx.file}: got ${got}, want ${fx.placement}`);
		}
		// Report every miss; allow at most one imperfect read across the set.
		console.log(`board images: ${fixtures.length - misses.length}/${fixtures.length} exact`);
		expect(misses.length, misses.join('\n')).toBeLessThanOrEqual(1);
	});

	test('a read image opens on the board', async ({ page }, info) => {
		test.skip(info.project.name === 'mobile', 'covered on desktop');
		const fx = fixtures.find((f) => f.source === 'lichess-gif') ?? fixtures[0]!;
		await openImport(page);
		await page.getByRole('dialog').locator('input[type="file"]').setInputFiles(join(FIXTURES, fx.file));
		await expect(page.getByText(/Board read in \d+ ms/)).toBeVisible({ timeout: 60_000 });
		const fen = await fenField(page).inputValue();
		await page.getByRole('button', { name: 'Open on board' }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect.poll(async () => (await activeRootFen(page)).fen.split(' ')[0]).toBe(fen.split(' ')[0]);
	});
});

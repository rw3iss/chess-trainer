import { expect, test } from '@playwright/test';

// Static privacy policy (public/privacy/index.html), linked from Settings. Google OAuth needs its URL.
test('privacy policy page loads and Settings links to it', async ({ page }) => {
	await page.goto('/settings');
	await page.waitForFunction(() => !!(window as unknown as { __chess?: unknown }).__chess, null, { timeout: 30_000 });
	await page.getByRole('link', { name: 'Privacy policy' }).first().click();
	await expect(page).toHaveURL(/\/privacy\.html$/);
	await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible();
	await expect(page.getByRole('link', { name: 'ryan+privacy@ryanweiss.net' })).toHaveAttribute('href', 'mailto:ryan+privacy@ryanweiss.net');
});

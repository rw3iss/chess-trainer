import { defineConfig, devices } from '@playwright/test';

// Offline / PWA e2e against the PRODUCTION build (the service worker only exists there).
// Build first: `pnpm exec vite build --config config/vite.config.ts`, then
// `pnpm exec playwright test --config config/playwright.preview.config.ts`.
const PORT = Number(process.env.E2E_PREVIEW_PORT ?? 4173);

export default defineConfig({
	testDir: '../e2e',
	testMatch: /offline\.spec\.ts$/,
	outputDir: '../test-results/preview',
	fullyParallel: false,
	workers: 1,
	reporter: [['list']],
	timeout: 90_000,
	use: {
		baseURL: `http://localhost:${PORT}`,
		serviceWorkers: 'allow',
		trace: 'retain-on-failure',
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
		{ name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
	],
	webServer: {
		command: `pnpm exec vite preview --config config/vite.config.ts --port ${PORT} --strictPort`,
		cwd: '..',
		port: PORT,
		reuseExistingServer: true,
		timeout: 60_000,
	},
});

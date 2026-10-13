import { defineConfig, devices } from '@playwright/test';

// E2E (PLAN §9). Runs against the Vite dev server on a dedicated port.
const PORT = Number(process.env.E2E_PORT ?? 5199);

export default defineConfig({
	testDir: '../e2e',
	outputDir: '../test-results',
	fullyParallel: true,
	reporter: [['list']],
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure',
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
		{ name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
	],
	webServer: {
		command: `pnpm exec vite --config config/vite.config.ts --port ${PORT} --strictPort`,
		cwd: '..',
		port: PORT,
		reuseExistingServer: true,
		timeout: 60_000,
	},
});

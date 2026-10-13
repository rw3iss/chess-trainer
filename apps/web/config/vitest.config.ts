import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { aliases, root } from './aliases.ts';

export default defineConfig({
	root,
	plugins: [preact()],
	resolve: { alias: aliases },
	test: {
		environment: 'jsdom',
		globals: false,
		setupFiles: ['config/vitest.setup.ts'],
		include: ['src/**/*.test.{ts,tsx}'],
		css: false,
		restoreMocks: true,
	},
});

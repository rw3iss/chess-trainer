import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { aliases, root } from './aliases.ts';

export default defineConfig({
	root,
	plugins: [
		preact(),
		VitePWA({
			// Custom SW (src/services/sw/sw.ts) with an injected precache manifest.
			strategies: 'injectManifest',
			srcDir: 'src/services/sw',
			filename: 'sw.ts',
			registerType: 'prompt',
			injectRegister: false,
			manifest: {
				name: 'Chess Openings',
				short_name: 'Openings',
				description: 'Learn chess openings — browse, play through, fork and practise against bots.',
				theme_color: '#0e0f12',
				background_color: '#0e0f12',
				display: 'standalone',
				orientation: 'any',
				start_url: '/',
				scope: '/',
				icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
			},
			injectManifest: {
				globPatterns: [
					'**/*.{js,css,html,svg,woff2,webmanifest}',
					'data/manifest.json',
					'data/openings*.json',
					'data/graph*.json',
				],
				globIgnores: ['data/notes*'],
				maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
			},
			devOptions: { enabled: false, type: 'module' },
		}),
	],
	resolve: {
		alias: aliases,
	},
	server: {
		port: 5173,
		open: false,
	},
	build: {
		outDir: 'dist',
		sourcemap: true,
		target: 'es2022',
	},
});

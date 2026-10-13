import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { aliases, root } from './aliases.ts';
import { pwaPrecacheIgnores } from './pwa.ts';

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
				id: '/',
				name: 'Chess Openings',
				short_name: 'Openings',
				description: 'Learn chess openings — browse, play through, fork and practise against bots.',
				theme_color: '#0e0f12',
				background_color: '#0e0f12',
				display: 'standalone',
				orientation: 'any',
				start_url: '/',
				scope: '/',
				categories: ['games', 'education'],
				icons: [
					{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
					{ src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
					{ src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
					{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
				],
			},
			// Precache = everything needed to work fully offline on first install (see BUILD.md "PWA").
			// Large / optional assets (sf-full, Maia + ORT wasm, other piece sets, notes chunks) are
			// cached at runtime by src/services/sw/sw.ts on first use.
			injectManifest: {
				globPatterns: [
					'index.html',
					'assets/**/*.{js,css,woff,woff2}',
					// Manifest icons are added by the plugin (includeManifestIcons); only the iOS icon here.
					'icons/apple-touch-icon.png',
					'data/manifest.json',
					'data/openings*.json',
					'data/graph*.json',
					'engines/manifest.json',
					'engines/stockfish/*.{js,wasm}',
					'pieces/manifest.json',
					'pieces/*/sprite.svg',
				],
				globIgnores: pwaPrecacheIgnores(),
				maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
			},
			devOptions: { enabled: false, type: 'module' },
		}),
	],
	resolve: {
		alias: aliases,
	},
	// onnxruntime-web ships its own wasm loaders; pre-bundling breaks them. Maia models are .onnx assets.
	optimizeDeps: { exclude: ['onnxruntime-web'] },
	assetsInclude: ['**/*.onnx'],
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

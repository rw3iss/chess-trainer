/// <reference lib="webworker" />
// Service worker (vite-plugin-pwa injectManifest). Typechecked by config/tsconfig.worker.json.
//
// Precache (vite.config.ts → config/pwa.ts): app shell + route chunks, icons, fonts, opening
// datasets (manifest/openings/graph), engines/manifest.json + sf-lite, default piece set.
//
// Runtime routes (first match wins):
//   /data/notes*                    StaleWhileRevalidate  'data-notes'
//   /data/*                         StaleWhileRevalidate  'data'
//   /pieces/*                       CacheFirst            'pieces'      (non-default piece sets)
//   /engines/*, Maia model, *.onnx,
//   ort-wasm*.wasm                  CacheFirst            'chess-engines-v1' (shared with engine/assetStore)
//   server API GETs                 NetworkFirst (3 s)    'api'         (never POST, /sync, socket.io)
//   Google Fonts                    CSS SWR, files CacheFirst
//   navigations                     precached index.html (denylist: /api, /socket.io, files)
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import type { WorkboxPlugin } from 'workbox-core/types.js';
import { isApiRequest, isEngineAsset, NAVIGATION_DENYLIST } from './routes';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

const DAY_S = 24 * 60 * 60;
/** Must match ENGINE_CACHE in services/engine/assetStore.ts. */
const ENGINE_CACHE = 'chess-engines-v1';

/** Only store complete 200 responses (never opaque / partial / error bodies). */
const only200: WorkboxPlugin = {
	cacheWillUpdate: async ({ response }) => (response.status === 200 ? response : null),
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigations → precached index.html (offline deep links).
try {
	registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: NAVIGATION_DENYLIST }));
} catch {
	/* index.html missing from the manifest in dev — ignore */
}

registerRoute(
	({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/data/notes'),
	new StaleWhileRevalidate({
		cacheName: 'data-notes',
		plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * DAY_S })],
	}),
);

registerRoute(
	({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/data/'),
	new StaleWhileRevalidate({
		cacheName: 'data',
		plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * DAY_S })],
	}),
);

registerRoute(
	({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/pieces/'),
	new CacheFirst({
		cacheName: 'pieces',
		plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 180 * DAY_S })],
	}),
);

// Engines + models: large, immutable, versioned by file name. Same cache the engine
// registry downloads into, so Settings → "download" and the SW share one copy.
registerRoute(
	({ url, request }) => request.method === 'GET' && isEngineAsset(url, self.location.origin),
	new CacheFirst({
		cacheName: ENGINE_CACHE,
		plugins: [only200],
	}),
);

registerRoute(
	({ url, request }) => isApiRequest(url, request.method, self.location.origin),
	new NetworkFirst({
		cacheName: 'api',
		networkTimeoutSeconds: 3,
		plugins: [
			only200,
			new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * DAY_S }),
		],
	}),
);

registerRoute(
	({ url }) => url.origin === 'https://fonts.googleapis.com',
	new StaleWhileRevalidate({ cacheName: 'google-fonts-css' }),
);

registerRoute(
	({ url }) => url.origin === 'https://fonts.gstatic.com',
	new CacheFirst({
		cacheName: 'google-fonts',
		plugins: [
			new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * DAY_S }),
		],
	}),
);

// The page asks us to activate after the user accepts the "new version" toast.
self.addEventListener('message', (event) => {
	if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

clientsClaim();

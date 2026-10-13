/// <reference lib="webworker" />
// Service worker (vite-plugin-pwa injectManifest). Typechecked by config/tsconfig.worker.json.
// Precache: app shell, route chunks, fonts/icons, opening datasets (manifest/openings/graph).
// Runtime: /data/* (notes chunks etc.) StaleWhileRevalidate, /pieces/* CacheFirst,
// Google Fonts CSS SWR + font files CacheFirst. Full PWA polish lands in phase 11.
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

const DAY_S = 24 * 60 * 60;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigations → precached index.html (offline deep links).
try {
	registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/] }));
} catch {
	/* index.html missing from the manifest in dev — ignore */
}

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

registerRoute(
	({ url }) => url.origin === 'https://fonts.googleapis.com',
	new StaleWhileRevalidate({ cacheName: 'google-fonts-css' }),
);

registerRoute(
	({ url }) => url.origin === 'https://fonts.gstatic.com',
	new CacheFirst({
		cacheName: 'google-fonts',
		plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * DAY_S })],
	}),
);

// The page asks us to activate after the user accepts the "new version" toast.
self.addEventListener('message', (event) => {
	if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

clientsClaim();

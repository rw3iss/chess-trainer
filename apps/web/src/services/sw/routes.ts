// Pure request matchers shared by the service worker (sw.ts) and its unit tests.
// No DOM / worker globals: callers pass the SW origin in.

/** API path prefixes that are safe to serve from cache when the server is slow/offline (GET only). */
export const API_CACHEABLE_PREFIXES = ['/health', '/openings', '/explorer', '/engines', '/auth/me', '/users/me', '/games', '/sessions'] as const;

/** Paths that must always hit the network (sync writes, realtime). */
const API_NEVER_CACHE = [/^\/(api\/)?sync(\/|$)/, /^\/socket\.io(\/|$)/];

/** Third-party origins that are not the app server (fonts, model hosts). */
const NON_API_ORIGINS = new Set(['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://raw.githubusercontent.com']);

/** Navigations that must not fall back to index.html. */
export const NAVIGATION_DENYLIST: RegExp[] = [/^\/api(\/|$)/, /^\/socket\.io(\/|$)/, /\/[^/?]+\.[^/]+$/];

/** Pinned Maia-2 model host/path (see services/engine/adapters/MaiaAdapter.ts MAIA2_DEFAULT_MODEL_URL). */
const MAIA_MODEL = /^https:\/\/raw\.githubusercontent\.com\/CSSLab\/maia-platform-frontend\/.+\.onnx$/;

function hasApiPrefix(pathname: string): boolean {
	return API_CACHEABLE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`));
}

/**
 * True for GET requests to the app server's read endpoints. The server is configurable
 * (Settings → server URL, default http://localhost:3000) and the SW cannot read settings,
 * so any cross-origin (non-font/model) host with an API path matches, plus a same-origin
 * `/api/*` reverse proxy.
 */
export function isApiRequest(url: URL, method: string, swOrigin: string): boolean {
	if (method !== 'GET') return false;
	let path = url.pathname;
	if (url.origin === swOrigin) {
		if (!path.startsWith('/api/')) return false;
		path = path.slice(4);
	} else if (NON_API_ORIGINS.has(url.origin)) {
		return false;
	}
	if (API_NEVER_CACHE.some((re) => re.test(path))) return false;
	return hasApiPrefix(path);
}

/** Large, immutable engine/model assets cached on first use (never precached). */
export function isEngineAsset(url: URL, swOrigin: string): boolean {
	if (url.origin === swOrigin) {
		if (url.pathname.startsWith('/engines/')) return true;
		if (url.pathname.startsWith('/models/')) return true;
		return url.pathname.endsWith('.onnx') || /\/ort-wasm[^/]*\.wasm$/.test(url.pathname);
	}
	return MAIA_MODEL.test(url.href);
}

// Navigate outside components (preact-iso's LocationProvider listens to popstate).
// No-op when already on `path`.
export function navigate(path: string, opts: { replace?: boolean } = {}): void {
	if (typeof window === 'undefined') return;
	if (location.pathname + location.search === path) return;
	if (opts.replace) history.replaceState(null, '', path);
	else history.pushState(null, '', path);
	dispatchEvent(new PopStateEvent('popstate'));
}

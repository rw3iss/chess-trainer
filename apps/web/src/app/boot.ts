// Boot sequence (non-blocking: the shell renders immediately, stores fill in).
//   1. restore every registered store (settings, sessions, favorites, games, themes…)
//   2. connect to the optional server using the configured URL
//   3. register fallback command handlers (features override later)
//   4. flush pending writes when the page is hidden
import { effect } from '@preact/signals';
import { flushStores, initStores } from '@/state';
import { settings } from '@/state/settings';
import { serverConnector } from '@/services/server';
import { registerDefaultSessionCommands } from '@/components/controls/sessionCommands';

let booted = false;

export async function boot(): Promise<void> {
	if (booted) return;
	booted = true;
	registerDefaultSessionCommands();
	await initStores();

	// Re-probe whenever the configured server URL changes.
	let lastUrl: string | null | undefined;
	effect(() => {
		const url = settings.value.server.url || null;
		if (url === lastUrl) return;
		lastUrl = url;
		void serverConnector.start(url);
	});

	const flush = () => void flushStores();
	window.addEventListener('pagehide', flush);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush();
	});
}

// Dev/e2e handle: window.__chess exposes stores for scripted checks (never in production builds).
if (import.meta.env.DEV && typeof window !== 'undefined') {
	void import('@/state').then((state) => {
		(window as unknown as { __chess: unknown }).__chess = state;
	});
}

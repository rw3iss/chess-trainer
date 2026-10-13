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
import { installNewGameFeature } from '@/components/controls/NewGameModal/install';
import { installClockFeature } from '@/components/clock/install';

let booted = false;

export async function boot(): Promise<void> {
	if (booted) return;
	booted = true;
	registerDefaultSessionCommands();
	// Engine feature: Engine tab, eval bar, arrows, BotModal ('openBot'). Lazy chunk.
	void import('@/components/engine').then((m) => m.registerEngineFeature());
	// New game modal + local PvP ('newGame', 'resign', 'offerDraw').
	installNewGameFeature();
	await initStores();
	// Clocks (stage slots + controller) and move sounds — after sessions are restored.
	installClockFeature();
	// Server feature: background sync + online-room stage wiring (after stores restore).
	void import('@/components/server').then((m) => m.registerServerFeature());
	// PWA: install prompt layer + persistent-storage request after the first save.
	void import('@/components/pwa').then((m) => m.registerPwaFeature());
	// Saved games: 'save' / 'saveAs' → SaveModal (quick overwrite when linked).
	void import('@/components/controls/SaveModal').then((m) => m.registerGamesFeature());
	void import('@/components/openings').then((m) => m.registerOpeningsFeature());

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

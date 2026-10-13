// Service-worker registration exposed as signals. (Hand-rolled instead of
// vite-plugin-pwa's virtual:pwa-register, which needs workbox-window.)
// main.tsx calls registerServiceWorker(); useServiceWorkerToasts() turns the
// signals into "new version — reload" / "ready offline" toasts.
import { signal } from '@preact/signals';
import { initInstallState } from './install';

export const SW_URL = '/sw.js';

export const swNeedRefresh = signal(false);
export const swOfflineReady = signal(false);

let registration: ServiceWorkerRegistration | null = null;

// Dev builds: expose the signals so the update / offline toasts can be previewed without a SW
// (`window.__pwa.swNeedRefresh.value = true`). Never in production.
if (import.meta.env.DEV && typeof window !== 'undefined') {
	(window as unknown as { __pwa?: object }).__pwa = { swNeedRefresh, swOfflineReady };
}

function track(worker: ServiceWorker | null): void {
	if (!worker) return;
	worker.addEventListener('statechange', () => {
		if (worker.state !== 'installed') return;
		// A controller already exists → this is an update waiting to activate.
		if (navigator.serviceWorker.controller) swNeedRefresh.value = true;
		else swOfflineReady.value = true;
	});
}

export async function registerServiceWorker(): Promise<void> {
	initInstallState(); // catch an early beforeinstallprompt, even before <PwaLayer/> mounts
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	if (import.meta.env.DEV) return; // no SW in dev (vite-plugin-pwa devOptions.enabled = false)
	try {
		registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
		if (registration.waiting && navigator.serviceWorker.controller) swNeedRefresh.value = true;
		registration.addEventListener('updatefound', () => track(registration?.installing ?? null));
		// Check for updates hourly while the app stays open.
		setInterval(() => void registration?.update(), 60 * 60 * 1000);
	} catch (e) {
		console.warn('[sw] registration failed', e);
	}
}

/** Activate the waiting SW and reload once it takes control. */
export function applyServiceWorkerUpdate(): void {
	swNeedRefresh.value = false;
	const waiting = registration?.waiting;
	if (!waiting) {
		location.reload();
		return;
	}
	navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
	// oxlint-disable-next-line unicorn/require-post-message-target-origin -- ServiceWorker.postMessage has no targetOrigin
	waiting.postMessage({ type: 'SKIP_WAITING' });
}

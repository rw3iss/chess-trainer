// PWA UI layer. Wired by app/boot.ts:
//   void import('@/components/pwa').then((m) => m.registerPwaFeature());
// (The "new version" / "ready offline" toasts come from useServiceWorkerToasts(), which
// App.tsx already calls — so PwaLayer deliberately does not.)
import { render, type JSX } from 'preact';
import { initInstallState, watchFirstSaveForPersistence } from '@/services/sw';
import { InstallPrompt } from './InstallPrompt';

export { InstallPrompt, type InstallPromptProps } from './InstallPrompt';

const HOST_ID = 'pwa-layer';

export function PwaLayer(): JSX.Element {
	return <InstallPrompt />;
}

let registered = false;

/**
 * Idempotent: mounts <PwaLayer/> into its own <div id="pwa-layer"> on <body> and starts
 * the first-save → navigator.storage.persist() watcher.
 */
export function registerPwaFeature(): void {
	if (registered || typeof document === 'undefined') return;
	registered = true;
	initInstallState();
	let host = document.getElementById(HOST_ID);
	if (!host) {
		host = document.createElement('div');
		host.id = HOST_ID;
		document.body.appendChild(host);
	}
	render(<PwaLayer />, host);
	watchFirstSaveForPersistence();
}

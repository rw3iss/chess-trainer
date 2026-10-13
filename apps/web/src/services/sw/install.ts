// "Add to home screen" state as signals. Chromium fires `beforeinstallprompt` (we stash it
// and expose promptInstall()); iOS Safari never does, so we expose an `iosInstallHint` flag
// instead. Dismissal is remembered in uiStorage. components/pwa/InstallPrompt renders this.
import { computed, signal } from '@preact/signals';
import { uiStorage } from '@/lib/storage';

/** Chromium's install prompt event (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
	readonly platforms: string[];
	readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	prompt(): Promise<void>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

const DISMISS_KEY = 'pwa-install-dismissed';

const deferred = signal<BeforeInstallPromptEvent | null>(null);

/** Running as an installed app (standalone display mode or iOS home-screen launch). */
export const isStandalone = signal(false);
/** User closed the install card; persisted. */
export const installDismissed = signal(false);
/** iOS Safari in a browser tab: no prompt API, show the Share → Add to Home Screen hint. */
export const iosInstallHint = signal(false);

/** A native install prompt is available right now. */
export const canInstall = computed(() => deferred.value !== null && !isStandalone.value);
/** The install card should be visible. */
export const showInstallPrompt = computed(() => !isStandalone.value && !installDismissed.value && (canInstall.value || iosInstallHint.value));

let started = false;

function detectStandalone(): boolean {
	const nav = navigator as Navigator & { standalone?: boolean };
	return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}

/** iPhone/iPad Safari (not Chrome/Firefox/Edge on iOS, which cannot add to home screen the same way). */
export function isIosSafari(ua: string = navigator.userAgent, maxTouchPoints: number = navigator.maxTouchPoints ?? 0): boolean {
	const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
	return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

/** Wire the install listeners once. Safe to call repeatedly; no-op outside a browser. */
export function initInstallState(): void {
	if (started || typeof window === 'undefined') return;
	started = true;
	installDismissed.value = uiStorage.get<boolean>(DISMISS_KEY, false) === true;
	isStandalone.value = detectStandalone();
	iosInstallHint.value = !isStandalone.value && isIosSafari();

	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault(); // keep the mini-infobar quiet; we show our own card
		deferred.value = e as BeforeInstallPromptEvent;
	});
	window.addEventListener('appinstalled', () => {
		deferred.value = null;
		isStandalone.value = true;
	});
	if (typeof matchMedia === 'function') {
		matchMedia('(display-mode: standalone)').addEventListener?.('change', () => (isStandalone.value = detectStandalone()));
	}
}

/** Show the native install dialog. The stashed event is single-use. */
export async function promptInstall(): Promise<InstallOutcome> {
	const e = deferred.value;
	if (!e) return 'unavailable';
	deferred.value = null;
	await e.prompt();
	const { outcome } = await e.userChoice;
	if (outcome === 'dismissed') dismissInstall();
	return outcome;
}

/** Hide the install card and remember it. */
export function dismissInstall(): void {
	installDismissed.value = true;
	uiStorage.set(DISMISS_KEY, true);
}

/** Forget a previous dismissal (e.g. a Settings "Install app" entry). */
export function resetInstallDismissal(): void {
	installDismissed.value = false;
	uiStorage.remove(DISMISS_KEY);
}

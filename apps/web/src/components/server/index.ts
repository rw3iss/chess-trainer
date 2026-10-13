// Server feature: settings section (URL + status, sign-in, sync, guest name) + background sync.
// Lazily mounted by the Settings page: `const { ServerSettingsSection } = await import('@/components/server')`.
// Booted from app/boot.ts: `void import('@/components/server').then((m) => m.registerServerFeature())`.
import { startSync } from '@/state/sync';
import { registerOnlineStage } from '@/components/play/onlineStage';
import { ServerSettingsSection } from './ServerSettingsSection';

let registered = false;

/** Start server sync (runs only when online + signed in + enabled) and wire online sessions into the stage. */
export function registerServerFeature(): void {
	if (registered) return;
	registered = true;
	startSync();
	registerOnlineStage();
}

export { ServerSettingsSection };
export default ServerSettingsSection;

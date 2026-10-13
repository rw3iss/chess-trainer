// Saved-games feature boot hook (called from app/boot.ts; this module is already in the shell chunk via AppShell, so the import resolves at once).
// Registers 'save' / 'saveAs' → SaveModal flow. Idempotent; returns unregister.
import { registerSaveCommands } from './SaveModalHost';

let off: (() => void) | null = null;

export function registerGamesFeature(): () => void {
	off ??= registerSaveCommands();
	return () => {
		off?.();
		off = null;
	};
}

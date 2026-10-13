// Ask the browser to keep our storage (IndexedDB games/notes, Cache Storage engines) out of
// eviction. Asked once — after the first real save, when the user has data worth keeping —
// and the answer is remembered so we never nag.
import { effect } from '@preact/signals';
import { uiStorage } from '@/lib/storage';
import { savedGames, savedGamesLoaded } from '@/state/savedGames';

const PERSIST_KEY = 'storage-persist-requested';

export type PersistResult = 'granted' | 'denied' | 'unsupported' | 'already-asked';

/** Calls navigator.storage.persist() once per device. */
export async function requestPersistentStorage(): Promise<PersistResult> {
	if (uiStorage.get<boolean>(PERSIST_KEY, false)) return 'already-asked';
	const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
	if (!storage?.persist) return 'unsupported';
	uiStorage.set(PERSIST_KEY, true);
	try {
		if (await storage.persisted?.()) return 'granted';
		return (await storage.persist()) ? 'granted' : 'denied';
	} catch {
		return 'denied';
	}
}

/**
 * Requests persistence the first time a save happens after boot: the saved-games list grows
 * past its loaded size (and is non-empty). Returns an unsubscribe function.
 */
export function watchFirstSaveForPersistence(): () => void {
	if (uiStorage.get<boolean>(PERSIST_KEY, false)) return () => {};
	let baseline: number | null = null;
	let dispose: (() => void) | null = null;
	dispose = effect(() => {
		const n = savedGames.value.length;
		if (!savedGamesLoaded.value) return;
		if (baseline === null) {
			baseline = n;
			return;
		}
		if (n > 0 && n > baseline) {
			void requestPersistentStorage();
			queueMicrotask(() => dispose?.());
		}
	});
	return () => dispose?.();
}

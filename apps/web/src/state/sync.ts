// App sync instance (composition root: wires the store-agnostic SyncService to the stores). The lead calls startSync() once after boot; stopSync() tears it down.
//
//   import { startSync, syncService, syncStatus, lastSyncAt, lastSyncError } from '@/state/sync';
//
// Store writes go through the stores' public APIs (no edits to their files):
//   saved games → repository put/remove, then loadSavedGames() refreshes the signal;
//   sessions    → sessionsActions.replace (open ids) / open(…, { activate: false }) (new) / close (deleted).
// Sessions in mode 'online' are skipped (rooms live on the server).
import { computed } from '@preact/signals';
import type { SavedGame, Session } from '@chess/core/game';
import { api } from '@/services/api';
import { getRepositories } from '@/services/db';
import { serverConnector } from '@/services/server';
import { authActions, authUser, isLoggedIn } from '@/state/auth';
import { loadSavedGames, savedGames } from '@/state/savedGames';
import { getSession, openSessions, sessionsActions } from '@/state/sessions';
import { settings } from '@/state/settings';
import { SyncService, type SyncStoreAdapter } from '@/services/sync/SyncService';

export * from '@/services/sync/SyncService';
export * from '@/services/sync/merge';

function syncable(s: Session): boolean {
	return s.mode !== 'online';
}

const savedGamesAdapter: SyncStoreAdapter<SavedGame> = {
	list: () => savedGames.value,
	watch: savedGames,
	async apply(upserts, deletes) {
		const repo = getRepositories().savedGames;
		await Promise.all([...upserts.map((g) => repo.put(g)), ...deletes.map((id) => repo.remove(id))]);
		await loadSavedGames();
	},
};

const sessionsAdapter: SyncStoreAdapter<Session> = {
	list: () => openSessions.value.filter(syncable),
	watch: openSessions,
	async apply(upserts, deletes) {
		for (const remote of upserts) {
			if (!syncable(remote)) continue;
			const local = getSession(remote.id);
			// Playback state is per device: keep ours, never auto-play a remote copy.
			const doc: Session = { ...remote, playback: local ? local.playback : { ...remote.playback, playing: false } };
			if (local) sessionsActions.replace(doc);
			else sessionsActions.open(doc, { activate: false });
		}
		for (const id of deletes) sessionsActions.close(id);
	},
};

/** `${serverUrl}|${userId}` while a non-guest user is signed in. */
const account = computed(() => {
	const user = authUser.value;
	const url = serverConnector.url.value;
	return isLoggedIn.value && user && url ? `${url}|${user.id}` : null;
});

export const syncService = new SyncService({
	sync: (req) => api.sync(req),
	kv: () => getRepositories().kv,
	savedGames: savedGamesAdapter,
	sessions: sessionsAdapter,
	ensureToken: () => authActions.ensureAccessToken(),
	account,
	online: serverConnector.isOnline,
	enabled: computed(() => settings.value.server.sync),
});

export const syncStatus = syncService.status;
export const lastSyncAt = syncService.lastSyncAt;
export const lastSyncError = syncService.lastError;

/** Start watchers + periodic sync (idempotent). Call after initStores(). */
export function startSync(): void {
	syncService.start();
}

export function stopSync(): void {
	syncService.stop();
}

/** Sync immediately (no-op status update when disabled/offline). */
export function syncNow(): Promise<void> {
	return syncService.syncNow();
}

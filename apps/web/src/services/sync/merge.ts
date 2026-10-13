// Pure last-writer-wins merge for /sync responses (mirrors the server rule in
// apps/server/src/modules/games/synced-docs.service.ts):
//   higher `revision` wins → equal revision: later `updatedAt` wins → exact tie keeps local.
// A remote tombstone deletes the local copy only when the local doc was not
// changed since the last sync (a newer local edit survives and is re-pushed).
import type { SavedGame, Session } from '@chess/core/game';
import type { SyncResponse } from '@chess/core/protocol';

/** Fields every synced document carries. */
export interface SyncDoc {
	id: string;
	revision: number;
	updatedAt: number;
}

/** What to apply locally for one document kind. */
export interface KindMerge<T> {
	upserts: T[];
	deletes: string[];
}

export interface LocalDocs {
	savedGames: readonly SavedGame[];
	sessions: readonly Session[];
}

export interface SyncMerge {
	savedGames: KindMerge<SavedGame>;
	sessions: KindMerge<Session>;
}

/** The LWW winner of two copies of the same document. Exact tie → `local`. */
export function lwwWinner<T extends SyncDoc>(local: T, remote: T): T {
	if (local.revision !== remote.revision) return remote.revision > local.revision ? remote : local;
	return remote.updatedAt > local.updatedAt ? remote : local;
}

/** Merge one kind. `lastSyncAt` = local clock mark of the previous successful sync. */
export function mergeKind<T extends SyncDoc>(local: readonly T[], remote: readonly T[], remoteDeleted: readonly string[], lastSyncAt: number): KindMerge<T> {
	const byId = new Map(local.map((d) => [d.id, d]));
	const upserts: T[] = [];
	const deletes: string[] = [];
	for (const r of remote) {
		const l = byId.get(r.id);
		if (!l || lwwWinner(l, r) === r) upserts.push(r);
	}
	const upserted = new Set(upserts.map((d) => d.id));
	for (const id of remoteDeleted) {
		const l = byId.get(id);
		if (!l || upserted.has(id)) continue;
		if (l.updatedAt <= lastSyncAt) deletes.push(id);
	}
	return { upserts, deletes };
}

/** Merge a whole SyncResponse against the local documents. Pure. */
export function mergeSync(local: LocalDocs, response: SyncResponse, lastSyncAt: number): SyncMerge {
	return {
		savedGames: mergeKind(local.savedGames, response.savedGames, response.deletedSavedGameIds, lastSyncAt),
		sessions: mergeKind(local.sessions, response.sessions, response.deletedSessionIds, lastSyncAt),
	};
}

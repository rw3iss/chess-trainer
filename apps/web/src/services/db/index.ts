// Injection point for local persistence. Stores import `repositories` from here
// (never Dexie). Tests call `setRepositories()` with a fresh db.
import { ChessDb } from './schema';
import { createDexieRepositories } from './repositories/dexie';
import type { Repositories } from './repositories/types';

export type * from './repositories/types';
export type * from './types';
export { favoriteId } from './types';
export { ChessDb } from './schema';
export { createDexieRepositories } from './repositories/dexie';

let current: Repositories | null = null;

export function getRepositories(): Repositories {
	current ??= createDexieRepositories(new ChessDb());
	return current;
}

/** Swap the backing repositories (tests, or a future sync-wrapping RemoteRepository). */
export function setRepositories(repos: Repositories): void {
	current = repos;
}

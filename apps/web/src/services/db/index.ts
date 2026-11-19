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
let device: Repositories | null = null;

/** The ACTIVE database: the signed-in account's, or the anonymous one (see ./accounts.ts). */
export function getRepositories(): Repositories {
	current ??= createDexieRepositories(new ChessDb());
	return current;
}

/** Swap the backing repositories (tests, or a future sync-wrapping RemoteRepository). */
export function setRepositories(repos: Repositories): void {
	current = repos;
}

/**
 * The DEVICE database ('chess-openings'): tokens, known accounts, active account, guest name.
 * Same as getRepositories() while anonymous (and in tests that only call setRepositories).
 */
export function getDeviceRepositories(): Repositories {
	return device ?? getRepositories();
}

/** null = the device database is the active one. */
export function setDeviceRepositories(repos: Repositories | null): void {
	device = repos;
}

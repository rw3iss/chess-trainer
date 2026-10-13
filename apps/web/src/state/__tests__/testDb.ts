// Fresh fake-indexeddb-backed repositories per test.
import { ChessDb, createDexieRepositories, setRepositories, type Repositories } from '@/services/db';

let n = 0;

export function freshRepositories(): { db: ChessDb; repos: Repositories } {
	const db = new ChessDb(`test-${Date.now()}-${n++}`);
	const repos = createDexieRepositories(db);
	setRepositories(repos);
	return { db, repos };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

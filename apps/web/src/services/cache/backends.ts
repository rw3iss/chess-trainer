// Async cache backends. IndexedDB (via Dexie) is the default so large payloads
// (explorer stats, engine lists, dataset fragments) survive reloads; memory is
// used in environments without IndexedDB.
import Dexie, { type EntityTable } from 'dexie';

export interface CacheEntry<T = unknown> {
	key: string;
	value: T;
	/** Epoch ms; null = never expires. */
	expiresAt: number | null;
	storedAt: number;
}

export interface AsyncCacheBackend {
	get<T>(key: string): Promise<CacheEntry<T> | undefined>;
	set<T>(entry: CacheEntry<T>): Promise<void>;
	remove(key: string): Promise<void>;
	clear(): Promise<void>;
	/** Delete expired entries. */
	prune(now: number): Promise<number>;
}

class CacheDb extends Dexie {
	entries!: EntityTable<CacheEntry, 'key'>;
	constructor(name: string) {
		super(name);
		this.version(1).stores({ entries: 'key, expiresAt' });
	}
}

export class IndexedDbCacheBackend implements AsyncCacheBackend {
	private db: CacheDb;
	constructor(name = 'chess-cache') {
		this.db = new CacheDb(name);
	}
	async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
		return (await this.db.entries.get(key)) as CacheEntry<T> | undefined;
	}
	async set<T>(entry: CacheEntry<T>): Promise<void> {
		await this.db.entries.put(entry as CacheEntry);
	}
	async remove(key: string): Promise<void> {
		await this.db.entries.delete(key);
	}
	async clear(): Promise<void> {
		await this.db.entries.clear();
	}
	async prune(now: number): Promise<number> {
		return this.db.entries.where('expiresAt').below(now).delete();
	}
}

export class MemoryCacheBackend implements AsyncCacheBackend {
	private map = new Map<string, CacheEntry>();
	async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
		return this.map.get(key) as CacheEntry<T> | undefined;
	}
	async set<T>(entry: CacheEntry<T>): Promise<void> {
		this.map.set(entry.key, entry as CacheEntry);
	}
	async remove(key: string): Promise<void> {
		this.map.delete(key);
	}
	async clear(): Promise<void> {
		this.map.clear();
	}
	async prune(now: number): Promise<number> {
		let n = 0;
		for (const [k, e] of this.map) {
			if (e.expiresAt !== null && e.expiresAt < now) {
				this.map.delete(k);
				n++;
			}
		}
		return n;
	}
}

export function defaultCacheBackend(): AsyncCacheBackend {
	return typeof indexedDB === 'undefined' ? new MemoryCacheBackend() : new IndexedDbCacheBackend();
}

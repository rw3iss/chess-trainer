// TTL data cache for fetched/derived data (NOT for user data — that's
// repositories, nor UI state — that's useUIState). Reads are stale-aware so
// callers can serve cached data instantly and revalidate in the background.
import { defaultCacheBackend, type AsyncCacheBackend } from './backends';

export interface CacheGetResult<T> {
	value: T;
	stale: boolean;
	storedAt: number;
}

export class DataCache {
	private inflight = new Map<string, Promise<unknown>>();

	constructor(private backend: AsyncCacheBackend = defaultCacheBackend(), private now: () => number = Date.now) {}

	/** Fresh value or undefined. */
	async get<T>(key: string): Promise<T | undefined> {
		const r = await this.peek<T>(key);
		return r && !r.stale ? r.value : undefined;
	}

	/** Value regardless of freshness (with a `stale` flag). */
	async peek<T>(key: string): Promise<CacheGetResult<T> | undefined> {
		try {
			const e = await this.backend.get<T>(key);
			if (!e) return undefined;
			return { value: e.value, stale: e.expiresAt !== null && e.expiresAt <= this.now(), storedAt: e.storedAt };
		} catch {
			return undefined;
		}
	}

	async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
		const now = this.now();
		try {
			await this.backend.set({ key, value, storedAt: now, expiresAt: ttlMs === undefined ? null : now + ttlMs });
		} catch {
			/* quota / clone errors must never break the UI */
		}
	}

	remove(key: string): Promise<void> {
		return this.backend.remove(key);
	}

	clear(): Promise<void> {
		return this.backend.clear();
	}

	prune(): Promise<number> {
		return this.backend.prune(this.now());
	}

	/** Fresh cached value, else load + store. Concurrent calls share one load. */
	async getOrFetch<T>(key: string, loader: () => Promise<T>, ttlMs?: number): Promise<T> {
		const fresh = await this.get<T>(key);
		if (fresh !== undefined) return fresh;
		return this.load(key, loader, ttlMs);
	}

	/** Force a load (dedupes concurrent loads of the same key). */
	load<T>(key: string, loader: () => Promise<T>, ttlMs?: number): Promise<T> {
		const existing = this.inflight.get(key) as Promise<T> | undefined;
		if (existing) return existing;
		const p = loader()
			.then(async (value) => {
				await this.set(key, value, ttlMs);
				return value;
			})
			.finally(() => this.inflight.delete(key));
		this.inflight.set(key, p);
		return p;
	}
}

export const dataCache = new DataCache();

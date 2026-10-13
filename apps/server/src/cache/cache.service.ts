import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Key/value cache with TTL. Two implementations behind one interface:
 * Redis (when REDIS_HOST is set) or an in-process Map (default). Values are
 * JSON-serialized in both, so callers see identical behaviour.
 */
export abstract class CacheService {
	/** 'redis' | 'memory' — lets callers skip work that only matters when shared (e.g. room mirrors). */
	abstract readonly kind: 'redis' | 'memory';
	abstract get<T>(key: string): Promise<T | undefined>;
	/** `ttlSeconds` omitted or 0 → no expiry. */
	abstract set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
	abstract del(key: string): Promise<void>;
	/** Returns true when the backend answers. */
	abstract ping(): Promise<boolean>;
}

@Injectable()
export class MemoryCacheService extends CacheService implements OnModuleDestroy {
	readonly kind = 'memory' as const;
	private readonly store = new Map<string, { json: string; expiresAt: number | null }>();
	// Periodic sweep so expired keys that are never read again don't leak.
	private readonly sweeper = setInterval(() => this.sweep(), 60_000).unref();

	async get<T>(key: string): Promise<T | undefined> {
		const hit = this.store.get(key);
		if (!hit) return undefined;
		if (hit.expiresAt !== null && hit.expiresAt <= Date.now()) {
			this.store.delete(key);
			return undefined;
		}
		return JSON.parse(hit.json) as T;
	}

	async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
		this.store.set(key, {
			json: JSON.stringify(value),
			expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
		});
	}

	async del(key: string): Promise<void> {
		this.store.delete(key);
	}

	async ping(): Promise<boolean> {
		return true;
	}

	onModuleDestroy(): void {
		clearInterval(this.sweeper);
	}

	private sweep(): void {
		const now = Date.now();
		for (const [k, v] of this.store) if (v.expiresAt !== null && v.expiresAt <= now) this.store.delete(k);
	}
}

@Injectable()
export class RedisCacheService extends CacheService implements OnModuleDestroy {
	readonly kind = 'redis' as const;
	private readonly logger = new Logger('Redis');

	constructor(private readonly client: Redis) {
		super();
		client.on('connect', () => this.logger.log('connected'));
		client.on('error', (err) => this.logger.warn(`error: ${err.message}`));
	}

	async get<T>(key: string): Promise<T | undefined> {
		const raw = await this.client.get(key);
		return raw === null ? undefined : (JSON.parse(raw) as T);
	}

	async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
		const json = JSON.stringify(value);
		if (ttlSeconds) await this.client.set(key, json, 'EX', ttlSeconds);
		else await this.client.set(key, json);
	}

	async del(key: string): Promise<void> {
		await this.client.del(key);
	}

	async ping(): Promise<boolean> {
		try {
			return (await this.client.ping()) === 'PONG';
		} catch {
			return false;
		}
	}

	async onModuleDestroy(): Promise<void> {
		await this.client.quit().catch(() => undefined);
	}
}

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Fixed-window counters on the shared CacheService (Redis in production, memory otherwise).
 * App-level limits for sensitive actions; nginx limit_req + fail2ban handle floods in front of it.
 */
@Injectable()
export class RateLimiter {
	constructor(private readonly cache: CacheService) {}

	/** Counts one hit; throws 429 with `message` once more than `limit` hits fall in the window. */
	async hit(key: string, limit: number, windowS: number, message = 'too many requests — try again later'): Promise<void> {
		const n = ((await this.cache.get<number>(`rl:${key}`)) ?? 0) + 1;
		if (n > limit) throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
		await this.cache.set(`rl:${key}`, n, windowS);
	}

	/** Throws 429 when the counter is already over `limit` (does not count). */
	async check(key: string, limit: number, message = 'too many requests — try again later'): Promise<void> {
		if (((await this.cache.get<number>(`rl:${key}`)) ?? 0) >= limit) throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
	}

	reset(key: string): Promise<void> {
		return this.cache.del(`rl:${key}`);
	}
}

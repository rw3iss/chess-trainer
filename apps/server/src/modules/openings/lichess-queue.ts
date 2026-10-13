import { Logger } from '@nestjs/common';

export class RateLimitedError extends Error {}

export interface QueueOptions {
	/** Minimum gap between request starts (Lichess asks for ≤1 req/s). */
	minIntervalMs: number;
	/** Wait after a 429 before retrying (Lichess asks for a full minute). */
	backoffMs: number;
	/** Retries after 429 before giving up. */
	maxRetries: number;
}

/**
 * Serial request queue for the Lichess API: one request in flight, at least
 * `minIntervalMs` between starts, and a global pause after any 429.
 * `sleep` is injectable so tests run instantly.
 */
export class LichessQueue {
	private readonly logger = new Logger('LichessQueue');
	private chain: Promise<unknown> = Promise.resolve();
	private nextAllowedAt = 0;

	constructor(
		private readonly opts: QueueOptions,
		private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
	) {}

	/** Queues `fn` (one fetch). Resolves with its Response once it is not a 429. */
	run(fn: () => Promise<Response>): Promise<Response> {
		const task = this.chain.then(() => this.execute(fn));
		// Keep the chain alive even when a task fails.
		this.chain = task.catch(() => undefined);
		return task;
	}

	private async execute(fn: () => Promise<Response>): Promise<Response> {
		for (let attempt = 0; ; attempt++) {
			const wait = this.nextAllowedAt - Date.now();
			// oxlint-disable-next-line no-await-in-loop -- requests are serialized on purpose
			if (wait > 0) await this.sleep(wait);
			this.nextAllowedAt = Date.now() + this.opts.minIntervalMs;
			// oxlint-disable-next-line no-await-in-loop -- requests are serialized on purpose
			const res = await fn();
			if (res.status !== 429) return res;
			this.logger.warn(`429 from Lichess — backing off ${this.opts.backoffMs}ms (attempt ${attempt + 1})`);
			this.nextAllowedAt = Date.now() + this.opts.backoffMs;
			if (attempt >= this.opts.maxRetries) throw new RateLimitedError('Lichess rate limit — try again later');
		}
	}
}

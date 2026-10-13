import { USER_AGENT } from './paths.js';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Spaces requests: each `wait()` resolves at least a random [minMs, maxMs] after the previous one. */
export class Throttle {
	private last = 0;
	/** Multiplier raised after 429s and relaxed slowly on success (adaptive pacing). */
	factor = 1;
	constructor(
		private readonly minMs: number,
		private readonly maxMs = minMs,
	) {}
	async wait(): Promise<void> {
		const gap = (this.minMs + Math.random() * (this.maxMs - this.minMs)) * this.factor;
		const due = this.last + gap;
		const now = Date.now();
		if (due > now) await sleep(due - now);
		this.last = Date.now();
	}
	penalize(): void {
		this.factor = Math.min(this.factor * 1.5, 4);
	}
	reward(): void {
		this.factor = Math.max(1, this.factor * 0.995);
	}
}

export interface RetryOptions {
	retries?: number;
	/** First wait after a 429 (doubles each time, capped at 15 min). */
	rateLimitWaitMs?: number;
	/** First wait after 5xx / network errors (doubles). */
	errorWaitMs?: number;
	log?: (msg: string) => void;
}

/** GET with throttle + retries. 429 → long backoff; 5xx/network → shorter backoff; other 4xx → returned as-is. */
export async function politeGet(url: string, throttle: Throttle, headers: Record<string, string> = {}, opts: RetryOptions = {}): Promise<Response> {
	const { retries = 8, rateLimitWaitMs = 60_000, errorWaitMs = 10_000, log = console.log } = opts;
	for (let attempt = 0; ; attempt++) {
		await throttle.wait();
		let res: Response | undefined;
		let err: unknown;
		try {
			res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers } });
		} catch (e) {
			err = e;
		}
		if (res && res.status !== 429 && res.status < 500) {
			throttle.reward();
			return res;
		}
		if (res?.status === 429) throttle.penalize();
		if (attempt >= retries) {
			if (res) return res;
			throw err;
		}
		const base = res?.status === 429 ? rateLimitWaitMs : errorWaitMs;
		const wait = Math.min(base * 2 ** attempt, 15 * 60_000);
		log(`  ${res ? `HTTP ${res.status}` : `network error (${String(err)})`} — waiting ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${retries})`);
		await res?.body?.cancel().catch(() => {});
		await sleep(wait);
	}
}

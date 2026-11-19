// Shared types + HTTP helpers for online game importers (Lichess, Chess.com). Browser-only fetches
// (both APIs allow CORS); no server involved.

export type ImportSite = 'lichess' | 'chesscom';

export interface RemoteImportOptions {
	username: string;
	/** Newest games first; stop after this many (undefined = all). */
	max?: number;
	/** Inclusive month range, 'YYYY-MM'. */
	from?: string;
	to?: string;
	ratedOnly?: boolean;
	signal?: AbortSignal;
	/** Injected for tests. */
	fetch?: typeof fetch;
	/** Injected for tests (rate-limit waits). */
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	/** Called before waiting out a rate limit. */
	onWait?: (ms: number) => void;
}

/** One game from a site: a stable id (dedupe) + its PGN. */
export interface RemoteGame {
	site: ImportSite;
	/** Site game id (Lichess id, Chess.com game number). */
	id: string;
	pgn: string;
	/** Epoch ms (game end / creation). */
	playedAt?: number;
	url?: string;
}

/** A user-facing import error (unknown user, network, too many retries). */
export class ImportError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = 'ImportError';
	}
}

export function abortError(): DOMException {
	return new DOMException('Import cancelled', 'AbortError');
}

export const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(abortError());
		const t = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(t);
			reject(abortError());
		};
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

export interface RetryPolicy {
	/** Wait after a 429 (ms). */
	waitMs: number;
	maxRetries: number;
}

/**
 * GET with rate-limit handling: on 429 waits (`Retry-After` when given, else `policy.waitMs`) and retries,
 * up to `maxRetries`. 404 → ImportError('… not found'). Other non-2xx → ImportError.
 */
export async function getWithRetry(url: string, init: RequestInit, opts: RemoteImportOptions, policy: RetryPolicy, notFound: string): Promise<Response> {
	const f = opts.fetch ?? fetch;
	const sleep = opts.sleep ?? defaultSleep;
	for (let attempt = 0; ; attempt++) {
		if (opts.signal?.aborted) throw abortError();
		let res: Response;
		try {
			res = await f(url, { ...init, signal: opts.signal });
		} catch (e) {
			if (isAbort(e) || opts.signal?.aborted) throw abortError();
			throw new ImportError('Could not reach the site. Check your connection and try again.');
		}
		if (res.status === 429) {
			if (attempt >= policy.maxRetries) throw new ImportError('The site is rate limiting requests. Try again in a few minutes.', 429);
			const retryAfter = Number(res.headers.get('Retry-After'));
			const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : policy.waitMs;
			opts.onWait?.(wait);
			await sleep(wait, opts.signal);
			continue;
		}
		if (res.status === 404) throw new ImportError(notFound, 404);
		if (!res.ok) throw new ImportError(`The site answered HTTP ${res.status}.`, res.status);
		return res;
	}
}

/** 'YYYY-MM' → epoch ms at the start of that month (UTC). */
export function monthStart(ym: string): number {
	const [y, m] = ym.split('-').map(Number);
	return Date.UTC(y!, m! - 1, 1);
}

/** 'YYYY-MM' → epoch ms at the end of that month (UTC, inclusive). */
export function monthEnd(ym: string): number {
	const [y, m] = ym.split('-').map(Number);
	return Date.UTC(y!, m!, 1) - 1;
}

export const USERNAME_INPUT_RE = /^[A-Za-z0-9_-]{2,30}$/;

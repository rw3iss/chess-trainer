// Lichess game import: GET https://lichess.org/api/games/user/<name> as NDJSON (one JSON game per line,
// newest first, PGN inside with pgnInJson=true). Streams, so large accounts start importing at once.
import { getWithRetry, ImportError, monthEnd, monthStart, type RemoteGame, type RemoteImportOptions } from './types';

const BASE = 'https://lichess.org';
/** Lichess asks clients to wait a full minute after a 429. */
const POLICY = { waitMs: 61_000, maxRetries: 3 };

interface LichessGameJson {
	id: string;
	pgn?: string;
	createdAt?: number;
	lastMoveAt?: number;
	rated?: boolean;
	variant?: string;
}

export function lichessGamesUrl(o: RemoteImportOptions): string {
	const q = new URLSearchParams({ pgnInJson: 'true', clocks: 'false', evals: 'false', opening: 'true', literate: 'false' });
	if (o.max) q.set('max', String(o.max));
	if (o.ratedOnly) q.set('rated', 'true');
	if (o.from) q.set('since', String(monthStart(o.from)));
	if (o.to) q.set('until', String(monthEnd(o.to)));
	return `${BASE}/api/games/user/${encodeURIComponent(o.username)}?${q}`;
}

/** Number of games on the account (for "of ~N"); undefined when unknown. */
export async function lichessGameCount(o: RemoteImportOptions): Promise<number | undefined> {
	const res = await getWithRetry(`${BASE}/api/user/${encodeURIComponent(o.username)}`, { headers: { Accept: 'application/json' } }, o, POLICY, `No Lichess player named “${o.username}”.`);
	const json = (await res.json().catch(() => ({}))) as { count?: { all?: number; rated?: number } };
	const n = o.ratedOnly ? json.count?.rated : json.count?.all;
	return typeof n === 'number' ? n : undefined;
}

/** Splits a byte stream into NDJSON lines (exported for tests). */
export async function* ndjsonLines(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
	const reader = body.getReader();
	const dec = new TextDecoder();
	let buf = '';
	try {
		for (;;) {
			if (signal?.aborted) return;
			const { done, value } = await reader.read();
			if (done) break;
			buf += dec.decode(value, { stream: true });
			let nl: number;
			while ((nl = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, nl).trim();
				buf = buf.slice(nl + 1);
				if (line) yield line;
			}
		}
		buf += dec.decode();
		if (buf.trim()) yield buf.trim();
	} finally {
		reader.releaseLock();
	}
}

/** Streams the user's games, newest first. Standard chess only (variants are skipped). */
export async function* lichessGames(o: RemoteImportOptions): AsyncGenerator<RemoteGame> {
	const res = await getWithRetry(lichessGamesUrl(o), { headers: { Accept: 'application/x-ndjson' } }, o, POLICY, `No Lichess player named “${o.username}”.`);
	const lines = res.body ? ndjsonLines(res.body, o.signal) : (async function* () {
		for (const l of (await res.text()).split('\n')) if (l.trim()) yield l.trim();
	})();
	for await (const line of lines) {
		let g: LichessGameJson;
		try {
			g = JSON.parse(line) as LichessGameJson;
		} catch {
			throw new ImportError('Lichess sent data that could not be read.');
		}
		if (!g.id || !g.pgn) continue;
		if (g.variant && g.variant !== 'standard' && g.variant !== 'fromPosition') continue;
		yield { site: 'lichess', id: g.id, pgn: g.pgn, playedAt: g.lastMoveAt ?? g.createdAt, url: `${BASE}/${g.id}` };
	}
}

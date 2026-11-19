// Chess.com game import (public data API, no sign-in): GET /pub/player/<name>/games/archives → monthly
// archive URLs → GET each month (JSON with `pgn` per game). Months are read newest first, sequentially.
import { getWithRetry, type RemoteGame, type RemoteImportOptions } from './types';

const BASE = 'https://api.chess.com/pub';
const POLICY = { waitMs: 5_000, maxRetries: 4 };

interface ChesscomGameJson {
	url?: string;
	pgn?: string;
	end_time?: number;
	rated?: boolean;
	rules?: string;
	uuid?: string;
}

/** Archive URLs (oldest → newest) limited to the [from, to] month range. */
export function filterArchives(urls: string[], from?: string, to?: string): string[] {
	return urls.filter((u) => {
		const m = /\/(\d{4})\/(\d{2})\/?$/.exec(u);
		if (!m) return false;
		const ym = `${m[1]}-${m[2]}`;
		return (!from || ym >= from) && (!to || ym <= to);
	});
}

/** Chess.com game id from its URL (…/game/live/123456 → '123456'), else the uuid. */
export function chesscomGameId(g: ChesscomGameJson): string | undefined {
	const m = /\/(\d+)\/?$/.exec(g.url ?? '');
	return m?.[1] ?? g.uuid;
}

/** The user's games, newest first. Standard chess only. */
export async function* chesscomGames(o: RemoteImportOptions): AsyncGenerator<RemoteGame> {
	const name = encodeURIComponent(o.username.toLowerCase());
	const notFound = `No Chess.com player named “${o.username}”.`;
	const res = await getWithRetry(`${BASE}/player/${name}/games/archives`, { headers: { Accept: 'application/json' } }, o, POLICY, notFound);
	const { archives = [] } = (await res.json()) as { archives?: string[] };
	const months = filterArchives(archives, o.from, o.to).reverse();
	let n = 0;
	for (const month of months) {
		const r = await getWithRetry(month, { headers: { Accept: 'application/json' } }, o, POLICY, notFound);
		const { games = [] } = (await r.json()) as { games?: ChesscomGameJson[] };
		for (const g of [...games].sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))) {
			if (!g.pgn || (g.rules && g.rules !== 'chess')) continue;
			if (o.ratedOnly && !g.rated) continue;
			const id = chesscomGameId(g);
			if (!id) continue;
			yield { site: 'chesscom', id, pgn: g.pgn, playedAt: g.end_time ? g.end_time * 1000 : undefined, url: g.url };
			if (o.max && ++n >= o.max) return;
		}
	}
}

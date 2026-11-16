import { resolve } from 'node:path';
import type { OpeningPopularity, ProviderStats } from './core.js';
import { readJsonl } from './jsonl.js';
import { POP_CACHE } from './paths.js';

export type Endpoint = 'lichess' | 'masters';

export interface PopRow {
	epd: string;
	white: number;
	draws: number;
	black: number;
	/** Fetch time (ms since epoch). */
	t: number;
}

export const POP_FILE = (ep: Endpoint) => resolve(POP_CACHE, `${ep}.jsonl`);

export function explorerUrl(ep: Endpoint, uci: string[]): string {
	const params = new URLSearchParams(
		ep === 'lichess'
			? { variant: 'standard', speeds: 'blitz,rapid,classical', ratings: '1600,1800,2000,2200,2500', moves: '0', topGames: '0', recentGames: '0' }
			: { moves: '0', topGames: '0' },
	);
	params.set('play', uci.join(','));
	return `https://explorer.lichess.org/${ep}?${params.toString().replace(/%2C/g, ',')}`;
}

/** Latest cached row per EPD. */
export function loadPopCache(ep: Endpoint): Map<string, PopRow> {
	return new Map(readJsonl<PopRow>(POP_FILE(ep)).map((r) => [r.epd, r]));
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

/**
 * Stats per EPD from ONE provider's rows. Score 0..100 = mean of (a) the percentile rank of the
 * game count among that provider's cached positions and (b) log-scaled count relative to its
 * most-played position — so scores compare only within one provider.
 */
export function providerStats(rows: Map<string, PopRow>): Map<string, ProviderStats> {
	const games = [...rows.values()].map((r) => r.white + r.draws + r.black).sort((a, b) => a - b);
	const maxLog = Math.log1p(games[games.length - 1] ?? 0) || 1;
	const rank = (g: number): number => {
		// fraction below + half the ties
		let lo = 0;
		let hi = games.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (games[mid]! < g) lo = mid + 1;
			else hi = mid;
		}
		let eq = lo;
		while (eq < games.length && games[eq] === g) eq++;
		return games.length ? (lo + (eq - lo) / 2) / games.length : 0;
	};
	const out = new Map<string, ProviderStats>();
	for (const [epd, r] of rows) {
		const total = r.white + r.draws + r.black;
		out.set(epd, {
			games: total,
			white: pct(r.white, total),
			draws: pct(r.draws, total),
			black: pct(r.black, total),
			score: Math.round(100 * (0.5 * rank(total) + 0.5 * (Math.log1p(total) / maxLog))),
		});
	}
	return out;
}

/** Popularity per EPD: Lichess stats at the top level, masters stats under `masters` (each scored on its own). */
export function computePopularity(lichess: Map<string, PopRow>, masters: Map<string, PopRow>): Map<string, OpeningPopularity> {
	const li = providerStats(lichess);
	const ma = providerStats(masters);
	const out = new Map<string, OpeningPopularity>();
	for (const [epd, s] of li) {
		const p: OpeningPopularity = { ...s };
		const m = ma.get(epd);
		if (m) p.masters = m;
		out.set(epd, p);
	}
	return out;
}

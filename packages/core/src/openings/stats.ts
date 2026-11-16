import type { OpeningEntry, ProviderStats, StatsSource } from './types.js';

/** The entry's stats from one provider (never mixed across providers). */
export function statsFor(entry: Pick<OpeningEntry, 'popularity'>, source: StatsSource): ProviderStats | undefined {
	const p = entry.popularity;
	if (!p) return undefined;
	if (source === 'masters') return p.masters;
	return p.games !== undefined ? p : undefined;
}

/** Popularity score 0..100 from one provider (-1 when unknown), for sorting. */
export function statsScore(entry: Pick<OpeningEntry, 'popularity'>, source: StatsSource): number {
	return statsFor(entry, source)?.score ?? -1;
}

export const STATS_SOURCE_LABELS: Record<StatsSource, string> = {
	lichess: 'Lichess',
	masters: 'Masters',
};

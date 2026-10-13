// Saved-games list query (URL state): ?q&fav&sort&source&mode&result
// Pure: parse / serialize / filter + sort. `source` is a SourceRef kind or `opening:<openingId>`.
import type { SavedGame, SessionMode, SourceRef } from '@chess/core/game';

export type GamesSort = 'updated' | 'created' | 'name';
export type ResultFilter = 'all' | 'white' | 'black' | 'draw' | 'ongoing';
export type ModeFilter = 'all' | SessionMode;
/** 'all' | SourceRef kind | `opening:<id>` */
export type SourceFilter = string;

export interface GamesQuery {
	q: string;
	fav: boolean;
	sort: GamesSort;
	source: SourceFilter;
	mode: ModeFilter;
	result: ResultFilter;
}

export interface GameOpeningInfo {
	id: string;
	name: string;
	eco?: string;
}

export const DEFAULT_GAMES_QUERY: GamesQuery = { q: '', fav: false, sort: 'updated', source: 'all', mode: 'all', result: 'all' };

const SORTS: readonly GamesSort[] = ['updated', 'created', 'name'];
const RESULTS: readonly ResultFilter[] = ['all', 'white', 'black', 'draw', 'ongoing'];
const MODES: readonly ModeFilter[] = ['all', 'analysis', 'bot', 'local-pvp', 'online'];
export const SOURCE_KINDS: readonly SourceRef['kind'][] = ['opening', 'new', 'fork', 'import', 'saved', 'online'];
export const OPENING_SOURCE_PREFIX = 'opening:';

function oneOf<T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T {
	return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function parseGamesQuery(query: Record<string, string | undefined>): GamesQuery {
	const src = query.source ?? '';
	const source = src.startsWith(OPENING_SOURCE_PREFIX) && src.length > OPENING_SOURCE_PREFIX.length ? src : oneOf<string>(src, SOURCE_KINDS, 'all');
	return {
		q: query.q ?? '',
		fav: query.fav === '1' || query.fav === 'true',
		sort: oneOf(query.sort, SORTS, 'updated'),
		source,
		mode: oneOf(query.mode, MODES, 'all'),
		result: oneOf(query.result, RESULTS, 'all'),
	};
}

/** Query string without defaults (no leading '?'; '' when everything is default). */
export function serializeGamesQuery(q: GamesQuery): string {
	const p = new URLSearchParams();
	if (q.q.trim()) p.set('q', q.q);
	if (q.fav) p.set('fav', '1');
	if (q.sort !== 'updated') p.set('sort', q.sort);
	if (q.source !== 'all') p.set('source', q.source);
	if (q.mode !== 'all') p.set('mode', q.mode);
	if (q.result !== 'all') p.set('result', q.result);
	return p.toString();
}

/** Number of active narrowing filters (not search/sort/fav). */
export function activeFilterCount(q: GamesQuery): number {
	return (q.source !== 'all' ? 1 : 0) + (q.mode !== 'all' ? 1 : 0) + (q.result !== 'all' ? 1 : 0);
}

export function normalizeText(s: string): string {
	return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function resultKey(g: SavedGame): Exclude<ResultFilter, 'all'> {
	if (!g.result) return 'ongoing';
	return g.result.winner ?? 'draw';
}

export type OpeningOf = (g: SavedGame) => GameOpeningInfo | undefined;

function gameOpeningId(g: SavedGame, openingOf: OpeningOf): string | undefined {
	return openingOf(g)?.id ?? g.source.openingId;
}

export function filterGames(games: readonly SavedGame[], q: GamesQuery, openingOf: OpeningOf = () => undefined): SavedGame[] {
	const tokens = normalizeText(q.q).split(/\s+/).filter(Boolean);
	const openingId = q.source.startsWith(OPENING_SOURCE_PREFIX) ? q.source.slice(OPENING_SOURCE_PREFIX.length) : null;
	return games.filter((g) => {
		if (q.fav && !g.favorite) return false;
		if (q.mode !== 'all' && g.mode !== q.mode) return false;
		if (q.result !== 'all' && resultKey(g) !== q.result) return false;
		if (openingId) {
			if (gameOpeningId(g, openingOf) !== openingId) return false;
		} else if (q.source !== 'all' && g.source.kind !== q.source) return false;
		if (tokens.length) {
			const o = openingOf(g);
			const hay = normalizeText([g.name, ...g.tags, o?.name ?? '', o?.eco ?? ''].join(' '));
			if (!tokens.every((t) => hay.includes(t))) return false;
		}
		return true;
	});
}

export function sortGames(games: readonly SavedGame[], sort: GamesSort): SavedGame[] {
	const out = [...games];
	if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || b.updatedAt - a.updatedAt);
	else if (sort === 'created') out.sort((a, b) => b.createdAt - a.createdAt);
	else out.sort((a, b) => b.updatedAt - a.updatedAt);
	return out;
}

export function queryGames(games: readonly SavedGame[], q: GamesQuery, openingOf?: OpeningOf): SavedGame[] {
	return sortGames(filterGames(games, q, openingOf), q.sort);
}

/** Distinct openings among the games (for the source filter), by name. */
export function openingsAmong(games: readonly SavedGame[], openingOf: OpeningOf): GameOpeningInfo[] {
	const seen = new Map<string, GameOpeningInfo>();
	for (const g of games) {
		const o = openingOf(g);
		if (o && !seen.has(o.id)) seen.set(o.id, o);
	}
	return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

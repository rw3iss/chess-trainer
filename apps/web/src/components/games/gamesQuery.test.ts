import { describe, expect, it } from 'vitest';
import { treeFromUci } from '@chess/core/chess';
import type { SavedGame } from '@chess/core/game';
import { activeFilterCount, filterGames, openingsAmong, parseGamesQuery, queryGames, serializeGamesQuery, sortGames, type OpeningOf } from './gamesQuery';

let n = 0;
function g(over: Partial<SavedGame>): SavedGame {
	const tree = treeFromUci(['e2e4']);
	n++;
	return {
		id: `g${n}`,
		name: `Game ${n}`,
		tags: [],
		favorite: false,
		tree,
		finalFen: tree.nodes[tree.rootId]!.fen,
		source: { kind: 'new' },
		mode: 'analysis',
		createdAt: n,
		updatedAt: n,
		revision: 0,
		...over,
	};
}

const najdorf = g({ name: 'Najdorf prep', tags: ['sharp'], favorite: true, source: { kind: 'opening', openingId: 'sic' }, createdAt: 10, updatedAt: 50, result: { winner: 'black', reason: 'resign' } });
const london = g({ name: 'London system', tags: ['solid', 'Repertoire'], mode: 'bot', createdAt: 30, updatedAt: 20, result: { winner: null, reason: 'draw-agreed' } });
const imported = g({ name: 'Ćarlsen – Café', source: { kind: 'import' }, createdAt: 20, updatedAt: 40 });
const games = [najdorf, london, imported];
const openingOf: OpeningOf = (x) => (x === najdorf ? { id: 'sic', name: 'Sicilian Defense: Najdorf', eco: 'B90' } : x === london ? { id: 'lon', name: 'London System', eco: 'D02' } : undefined);

describe('games query (URL)', () => {
	it('parses with defaults and rejects junk', () => {
		expect(parseGamesQuery({})).toEqual({ q: '', fav: false, sort: 'updated', source: 'all', mode: 'all', result: 'all' });
		const q = parseGamesQuery({ q: 'nf3', fav: '1', sort: 'name', source: 'opening:sic', mode: 'bot', result: 'draw' });
		expect(q).toEqual({ q: 'nf3', fav: true, sort: 'name', source: 'opening:sic', mode: 'bot', result: 'draw' });
		expect(parseGamesQuery({ sort: 'bogus', mode: 'x', source: 'opening:', result: '?' })).toEqual(parseGamesQuery({}));
	});

	it('serializes only non-defaults and round-trips', () => {
		expect(serializeGamesQuery(parseGamesQuery({}))).toBe('');
		const q = parseGamesQuery({ q: 'a b', fav: '1', sort: 'created', source: 'import', result: 'ongoing' });
		const qs = serializeGamesQuery(q);
		expect(qs).toBe('q=a+b&fav=1&sort=created&source=import&result=ongoing');
		expect(parseGamesQuery(Object.fromEntries(new URLSearchParams(qs)))).toEqual(q);
		expect(activeFilterCount(q)).toBe(2);
	});
});

describe('filter + sort', () => {
	const base = parseGamesQuery({});
	it('searches name, tags and opening name (accent/case-insensitive, all tokens)', () => {
		expect(filterGames(games, { ...base, q: 'repertoire' }, openingOf)).toEqual([london]);
		expect(filterGames(games, { ...base, q: 'sicilian' }, openingOf)).toEqual([najdorf]);
		expect(filterGames(games, { ...base, q: 'b90' }, openingOf)).toEqual([najdorf]);
		expect(filterGames(games, { ...base, q: 'carlsen cafe' }, openingOf)).toEqual([imported]);
		expect(filterGames(games, { ...base, q: 'london sharp' }, openingOf)).toEqual([]);
	});

	it('filters favourites, mode, result, source kind and opening', () => {
		expect(filterGames(games, { ...base, fav: true })).toEqual([najdorf]);
		expect(filterGames(games, { ...base, mode: 'bot' })).toEqual([london]);
		expect(filterGames(games, { ...base, result: 'black' })).toEqual([najdorf]);
		expect(filterGames(games, { ...base, result: 'draw' })).toEqual([london]);
		expect(filterGames(games, { ...base, result: 'ongoing' })).toEqual([imported]);
		expect(filterGames(games, { ...base, source: 'import' })).toEqual([imported]);
		expect(filterGames(games, { ...base, source: 'opening:lon' }, openingOf)).toEqual([london]);
		// Falls back to source.openingId when no identifier is loaded.
		expect(filterGames(games, { ...base, source: 'opening:sic' })).toEqual([najdorf]);
	});

	it('sorts by updated, created and name', () => {
		expect(sortGames(games, 'updated')).toEqual([najdorf, imported, london]);
		expect(sortGames(games, 'created')).toEqual([london, imported, najdorf]);
		expect(sortGames(games, 'name').map((x) => x.name)).toEqual(['Ćarlsen – Café', 'London system', 'Najdorf prep']);
		expect(queryGames(games, { ...base, q: 'system', sort: 'name' })).toEqual([london]);
	});

	it('lists distinct openings for the source filter', () => {
		expect(openingsAmong(games, openingOf).map((o) => o.id)).toEqual(['lon', 'sic']);
	});
});

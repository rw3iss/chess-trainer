import { describe, expect, it } from 'vitest';
import { FIXTURE_OPENINGS } from './__fixtures__/dataset';
import { createSearchEngine, normalizeSan, parseSearch, type OpeningQuery, type QueryContext } from './searchCore';
import { createOpeningSearch } from './searchClient';

const entries = FIXTURE_OPENINGS.openings;
const engine = createSearchEngine(entries);
const names = (q: Partial<OpeningQuery>, ctx?: QueryContext) => [...engine.query({ q: '', ...q }, ctx)].map((i) => entries[i]!.name);

describe('parseSearch', () => {
	it('splits text, SAN and ECO tokens', () => {
		expect(parseSearch('sicilian najdorf')).toEqual({ text: 'sicilian najdorf', san: [], eco: [] });
		expect(parseSearch('1.e4 c5 2.Nf3')).toEqual({ text: '', san: ['e4', 'c5', 'nf3'], eco: [] });
		expect(parseSearch('B90 c60 E')).toEqual({ text: '', san: [], eco: ['B90', 'C60', 'E'] });
		expect(parseSearch('ruy Bb5+ O-O 0-0-0')).toEqual({ text: 'ruy', san: ['bb5', 'o-o', 'o-o-o'], eco: [] });
	});

	it('normalizeSan strips annotations', () => {
		expect(normalizeSan('Nxe4+!?')).toBe('nxe4');
		expect(normalizeSan('e8=Q#')).toBe('e8q');
		expect(normalizeSan('0-0')).toBe('o-o');
	});
});

describe('search engine', () => {
	it('fuzzy name search (AND, prefix) ranks the main line first', () => {
		const r = names({ q: 'sicilian najdorf' });
		expect(r).toEqual(['Sicilian Defense: Najdorf Variation', 'Sicilian Defense: Najdorf Variation, English Attack']);
		expect(names({ q: 'sicillian' })).toContain('Sicilian Defense');
		expect(names({ q: 'najd' })).toHaveLength(2);
	});

	it('matches aliases and families', () => {
		expect(names({ q: 'giuoco' })).toEqual(['Italian Game']);
		expect(names({ q: 'open game' })).toContain("King's Knight Opening");
	});

	it('SAN sequences match line prefixes, exact length first', () => {
		expect(names({ q: 'e4 c5' })).toEqual(['Sicilian Defense', 'Sicilian Defense: Najdorf Variation', 'Sicilian Defense: Smith-Morra Gambit', 'Sicilian Defense: Najdorf Variation, English Attack']);
		expect(names({ q: '1.e4 c5 2.Nf3' })).toEqual(['Sicilian Defense: Najdorf Variation', 'Sicilian Defense: Najdorf Variation, English Attack']);
		expect(names({ q: 'e4 e5 nf3 nc6 bb5 nf6 o-o' })).toEqual(['Ruy Lopez: Berlin Defense, Rio Gambit Accepted']);
		expect(names({ q: 'h4' })).toEqual([]);
	});

	it('mixes text and moves', () => {
		expect(names({ q: 'ruy e4 e5 Nf3 Nc6 Bb5 Nf6' })).toEqual(['Ruy Lopez: Berlin Defense', 'Ruy Lopez: Berlin Defense, Rio Gambit Accepted']);
	});

	it('ECO codes and prefixes', () => {
		expect(names({ q: 'B90' })).toHaveLength(2);
		expect(names({ q: 'C6' })).toEqual(expect.arrayContaining(['Ruy Lopez', 'Ruy Lopez: Berlin Defense', 'Ruy Lopez: Berlin Defense, Rio Gambit Accepted']));
		expect(names({ q: 'C6' })).toHaveLength(3);
	});

	it('filters: color, ECO letters, family, length, notes, favorites', () => {
		expect(names({ color: 'black' }).every((n) => entries.find((e) => e.name === n)!.perspective === 'black')).toBe(true);
		expect(names({ eco: ['D'] }).sort()).toEqual(["Queen's Gambit", "Queen's Gambit Declined", "Queen's Pawn Game: Zukertort Variation"]);
		expect(names({ family: 'Ruy Lopez' })).toHaveLength(3);
		expect(names({ minPlies: 8, maxPlies: 10 })).toEqual(['Sicilian Defense: Najdorf Variation', 'Ruy Lopez: Berlin Defense, Rio Gambit Accepted']);
		expect(names({ notes: true })).toEqual(['Sicilian Defense: Najdorf Variation']);
		expect(names({ fav: true }, { favoriteIds: ['italian0001', '0ffassxvtk8'] })).toEqual(['Italian Game', 'Ruy Lopez']);
		expect(names({ fav: true })).toEqual([]);
	});

	it('sorts: popularity, name, ECO, length, white/black score, recent', () => {
		expect(names({}).slice(0, 3)).toEqual(['Italian Game', 'Sicilian Defense', "King's Knight Opening"]);
		const byName = names({ sort: 'name' });
		expect(byName[0]).toBe('Italian Game');
		expect(byName.at(-1)).toBe('Zukertort Opening: Queen\'s Gambit Invitation');
		expect(names({ sort: 'eco' })[0]).toBe("Zukertort Opening: Queen's Gambit Invitation");
		expect(names({ sort: 'length' }).slice(0, 2)).toEqual(['Sicilian Defense', "King's Pawn Game"]);
		expect(names({ sort: 'white' })[0]).toBe('Italian Game');
		expect(names({ sort: 'black' })[0]).toBe('Sicilian Defense: Najdorf Variation');
		expect(names({ sort: 'recent' }, { recentIds: ['16y3vpktp2q', 'italian0001'] }).slice(0, 2)).toEqual(["Queen's Gambit", 'Italian Game']);
	});
});

describe('createOpeningSearch (no Worker in jsdom → local engine)', () => {
	it('answers queries in-process', async () => {
		const s = createOpeningSearch(entries, JSON.stringify(FIXTURE_OPENINGS));
		expect(s.mode).toBe('local');
		const r = await s.query({ q: 'italian' });
		expect([...r].map((i) => entries[i]!.id)).toEqual(['italian0001']);
		s.dispose();
	});
});

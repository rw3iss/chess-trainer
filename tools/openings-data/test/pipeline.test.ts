import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/graph.js';
import { perspectiveFor } from '../src/perspective.js';
import { replaySan, replayUci, sanTokens } from '../src/replay.js';
import { parseEcoJson, parseLichessTsv } from '../src/sources.js';
import { fixture, miniMerge } from './helpers.js';

describe('parsing', () => {
	it('tokenises PGN move text', () => {
		expect(sanTokens('1. e4 e5 2. Nf3 {c} Nc6 (2... d6) 3.Bb5!? 1-0')).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
		expect(sanTokens('1.d4 1...d5')).toEqual(['d4', 'd5']);
	});

	it('parses the Lichess TSV', () => {
		const rows = parseLichessTsv(fixture('mini.tsv'));
		expect(rows).toHaveLength(11);
		expect(rows[2]).toMatchObject({ eco: 'C60', name: 'Ruy Lopez', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], source: 'lichess' });
	});

	it('parses eco.json and skips interpolated entries', () => {
		const rows = parseEcoJson(fixture('mini-eco.json'));
		expect(rows.map((r) => r.name)).toEqual(["King's Knight Opening", 'Vienna Game', 'Illegal line']);
		expect(rows[1]!.aliases).toEqual(['Vienna game']);
	});
});

describe('replay', () => {
	it('emits standard castling UCI and legal-ep EPDs', () => {
		const line = replaySan(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O'])!;
		expect(line.uci.at(-1)).toBe('e1g1');
		expect(line.san.at(-1)).toBe('O-O');
		// 1.e4: no capturing pawn → no ep square in the EPD.
		expect(line.epds[1]).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -');
	});

	it('accepts both castling forms in UCI replay', () => {
		const base = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6'];
		expect(replayUci([...base, 'e1g1'])!.epds.at(-1)).toBe(replayUci([...base, 'e1h1'])!.epds.at(-1));
	});

	it('returns null for illegal moves', () => {
		expect(replaySan(['e4', 'e5', 'Ke3'])).toBeNull();
	});
});

describe('merge / dedupe', () => {
	it('keeps Lichess entries canonical and folds eco.json names at the same EPD into aliases', () => {
		const { openings, stats } = miniMerge();
		expect(stats).toMatchObject({ lichess: 11, failed: 1, ecoMergedAsAlias: 1, ecoNew: 1 });
		const kk = openings.find((o) => o.entry.name === "King's Knight Opening")!.entry;
		expect(kk.source).toBe('lichess');
		expect(kk.aliases).toEqual(['Open Game: 2.Nf3']);
		const vienna = openings.find((o) => o.entry.name === 'Vienna Game')!.entry;
		expect(vienna).toMatchObject({ source: 'eco.json', eco: 'C25' });
		expect(vienna.aliases).toBeUndefined(); // 'Vienna game' is a case-only duplicate
	});

	it('derives id, family/variation, plies, epd', () => {
		const { openings } = miniMerge();
		const berlin = openings.find((o) => o.entry.name === 'Ruy Lopez: Berlin Defense')!.entry;
		expect(berlin).toMatchObject({ family: 'Ruy Lopez', variation: 'Berlin Defense', plies: 6 });
		expect(berlin.id).toMatch(/^[0-9a-z]{11}$/);
		expect(berlin.epd).toBe('r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -');
		expect(new Set(openings.map((o) => o.entry.id)).size).toBe(openings.length);
	});

	it('sorts by ECO', () => {
		const ecos = miniMerge().openings.map((o) => o.entry.eco);
		expect(ecos).toEqual([...ecos].sort());
	});
});

describe('perspective', () => {
	it.each([
		['Sicilian Defense', 2, 'black'],
		['Sicilian Defense: Smith-Morra Gambit', 5, 'white'],
		['Ruy Lopez', 5, 'white'],
		['Ruy Lopez: Berlin Defense', 6, 'black'],
		["Queen's Gambit", 3, 'white'],
		["Queen's Gambit Declined", 4, 'black'],
		["Queen's Gambit Declined: Albin Countergambit", 4, 'black'],
		['Englund Gambit', 2, 'black'],
		["King's Indian Attack", 1, 'white'],
		['Italian Game: Evans Gambit', 7, 'white'],
		['London System', 3, 'white'],
		['Some Unnamed Line', 4, 'black'],
		['Some Unnamed Line', 3, 'white'],
	] as const)('%s (%d plies) → %s', (name, plies, color) => {
		expect(perspectiveFor(name, plies)).toBe(color);
	});
});

describe('graph', () => {
	it('merges transpositions and records ends', () => {
		const { openings } = miniMerge();
		const g = buildGraph(openings, 1);
		expect(g.epd[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
		// 1.d4 d5 2.Nf3 and 1.Nf3 d5 2.d4 reach the same node.
		const zuk = openings.find((o) => o.entry.name.startsWith("Queen's Pawn Game: Zukertort"))!.entry;
		const inv = openings.find((o) => o.entry.name.startsWith('Zukertort Opening'))!.entry;
		expect(zuk.epd).toBe(inv.epd);
		const node = g.epd.indexOf(zuk.epd);
		expect(g.ends[node]!.sort()).toEqual([zuk.id, inv.id].sort());
		// Two incoming edges into that node.
		const incoming = g.edges.flat().filter((e) => e[2] === node);
		expect(incoming.map((e) => e[1]).sort()).toEqual(['Nf3', 'd4']);
		// Edges are unique per node and nodes are unique per EPD.
		expect(new Set(g.epd).size).toBe(g.epd.length);
		for (const list of g.edges) expect(new Set(list.map((e) => e[0])).size).toBe(list.length);
		// Root has e4, d4, Nf3.
		expect(g.edges[0]!.map((e) => e[1]).sort()).toEqual(['Nf3', 'd4', 'e4']);
	});
});

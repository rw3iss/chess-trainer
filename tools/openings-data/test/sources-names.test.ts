import { describe, expect, it } from 'vitest';
import { addAlias, mergeOpenings } from '../src/merge.js';
import { canonicalName, cleanName, hasMoveText, isRedundantAlias, nameKey, titleCase } from '../src/names.js';
import { parseLichessTsv, parseScidEco, type RawLine } from '../src/sources.js';
import { pageName, titleToSans, wikibooksLines } from '../src/wikibooks-lib.js';
import type { OpeningEntry } from '../src/core.js';

describe('names', () => {
	it('nameKey ignores case, accents, punctuation and Defence/Defense', () => {
		expect(nameKey("Petrov's Defence")).toBe(nameKey('Petrovs defense'));
		expect(nameKey('Grünfeld Defense')).toBe(nameKey('Gruenfeld Defense'));
		expect(nameKey('Grünfeld Defense')).toBe(nameKey('Grunfeld Defense'));
		expect(nameKey('Sämisch')).toBe(nameKey('Saemisch'));
	});

	it('detects move text', () => {
		for (const n of ['Sicilian: Najdorf, 6.Bg5', 'Caro-Kann - 4. c3', 'Setup with Bf4', 'Black ...e6', 'Barnes: 1... e5']) expect(hasMoveText(n)).toBe(true);
		for (const n of ['Sicilian Defense: Najdorf Variation', 'B12', "King's Gambit"]) expect(hasMoveText(n)).toBe(false);
	});

	it('cleans template leftovers, ECO notes, parentheses and abbreviations', () => {
		expect(cleanName('Name=Stafford Gambit')).toBe('Stafford Gambit');
		expect(cleanName('Zilbermints Double Countergambit; KGD')).toBe('Zilbermints Double Countergambit');
		expect(cleanName('Mirrored Halloween (informal)')).toBe('Mirrored Halloween');
		expect(cleanName('Hanstein Gambit: KGA')).toBe("Hanstein Gambit: King's Gambit Accepted");
		expect(cleanName('Caro–Kann - Botvinnik-Carls Defense')).toBe('Caro-Kann: Botvinnik-Carls Defense');
	});

	it('title-cases words but never move text', () => {
		expect(titleCase('English attack')).toBe('English Attack');
		expect(titleCase('Najdorf, 6.Bg5 e6 cxd4 of the line')).toBe('Najdorf, 6.Bg5 e6 cxd4 of the line'.replace('line', 'Line'));
	});

	it('canonicalName: spelling, family expansion, bare names under the ancestor', () => {
		const najdorf = { name: 'Sicilian Defense: Najdorf Variation', family: 'Sicilian Defense' };
		const families = new Set([nameKey('Sicilian Defense'), nameKey("Queen's Pawn Game")]);
		expect(canonicalName('English attack', najdorf, families)).toBe('Sicilian Defense: Najdorf Variation, English Attack');
		expect(canonicalName('Sicilian: Najdorf, 6.Bg5', najdorf, families)).toBe('Sicilian Defense: Najdorf, 6.Bg5');
		expect(canonicalName("Petrov's Defence, Vladimir Variation")).toBe("Petrov's Defense: Vladimir Variation");
		expect(canonicalName("Queen's Pawn Game", najdorf, families)).toBe("Queen's Pawn Game");
		expect(canonicalName('Horn attack', { name: 'Barnes Opening: 1... e5', family: 'Barnes Opening' }, families)).toBe('Barnes Opening: Horn Attack');
	});

	it('isRedundantAlias: parent names, abbreviations and reorderings say nothing new', () => {
		const p = 'Grünfeld Defense: Exchange Variation';
		expect(isRedundantAlias('Exchange Variation: Grunfeld', p)).toBe(true);
		expect(isRedundantAlias('Grünfeld Defense', p)).toBe(true);
		expect(isRedundantAlias('Catalan: Open', 'Catalan Opening: Open Defense')).toBe(true);
		expect(isRedundantAlias('Russian Game: Vladimir Variation', "Petrov's Defense: Vladimir Variation")).toBe(false);
	});
});

describe('addAlias', () => {
	const entry = () => ({ name: 'Ruy Lopez: Lucena Variation' }) as OpeningEntry;
	it('keeps real alternatives only', () => {
		const e = entry();
		for (const a of ['Spanish Game: Lucena Variation', 'ruy lopez: lucena variation', 'Lucena Variation: Ruy Lopez', 'C60', 'Ruy Lopez: Lucena, 4.Qe2', 'Spanish Game: Lucena Variation']) addAlias(e, a);
		expect(e.aliases).toEqual(['Spanish Game: Lucena Variation']);
	});
});

describe('parseScidEco', () => {
	it('parses entries, wrapped lines and extended codes; skips comments and empty lines', () => {
		const text = ['# comment', 'A00a "Start position"  *', 'B90a "Sicilian: Najdorf"  1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6', '  5.Nc3 a6 *', 'C20 "KP: Patzer"  1.e4 e5 2.Qh5 *'].join('\n');
		const rows = parseScidEco(text);
		expect(rows.map((r) => [r.eco, r.name, r.sans.length, r.source])).toEqual([
			['B90', 'Sicilian: Najdorf', 10, 'scid'],
			['C20', 'KP: Patzer', 3, 'scid'],
		]);
	});
});

describe('wikibooks', () => {
	it('titleToSans reads move paths only', () => {
		expect(titleToSans('Chess Opening Theory/1. e4/1...c5/2. Nf3')).toEqual(['e4', 'c5', 'Nf3']);
		expect(titleToSans('Chess Opening Theory/1. e4/2. Nf3')).toBeNull();
		expect(titleToSans('Chess Opening Theory/Index')).toBeNull();
	});

	it('pageName reads the Position template (positional or name=) or the first heading', () => {
		expect(pageName('{{Chess Opening Theory/Position|=\n|Sicilian Defence, Najdorf Variation|\n')).toBe('Sicilian Defence, Najdorf Variation');
		expect(pageName('{{Chess Opening Theory/Position|name=Marshall gambit|\n|x|')).toBe('Marshall gambit');
		expect(pageName('=St. George Defence:Three Pawns Attack=\ntext')).toBe('St. George Defence: Three Pawns Attack');
		expect(pageName('{{Chess Opening Theory/Position|=\n|=|\n')).toBeUndefined();
	});

	it('wikibooksLines keeps pages that name something new', () => {
		const head = (n: string) => `{{Chess Opening Theory/Position|=\n|${n}|\n`;
		const lines = wikibooksLines([
			{ title: 'Chess Opening Theory/1. e4', head: head("King's Pawn"), t: 0 },
			{ title: 'Chess Opening Theory/1. e4/1...e5', head: head("King's pawn"), t: 0 },
			{ title: 'Chess Opening Theory/1. e4/1...e5/2. Qh5', head: head('Parham Attack'), t: 0 },
			{ title: 'Chess Opening Theory/1. e4/1...e5/2. Qh5/2...Nc6', head: head('Parham - 2... Nc6'), t: 0 },
		]);
		expect(lines.map((l) => l.name)).toEqual(["King's Pawn", 'Parham Attack']);
	});
});

describe('mergeOpenings with extra sources', () => {
	const tsv = parseLichessTsv('eco\tname\tpgn\nB20\tSicilian Defense\t1. e4 c5\nB90\tSicilian Defense: Najdorf Variation\t1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6\n');
	const raw = (source: RawLine['source'], name: string, moves: string, eco = ''): RawLine => ({ source, name, eco, sans: moves.split(' '), aliases: [] });

	it('same line → alias (real alternatives only); new line → canonical name, ancestor ECO', () => {
		const { openings, stats } = mergeOpenings(tsv, [], [
			raw('scid', 'Sicilian: Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', 'B90'),
			raw('scid', 'Sicilian: Najdorf, 6.Bg5', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5', 'B94'),
			raw('wikibooks', 'English attack', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3'),
			raw('wikibooks', 'Najdorf Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2'),
		]);
		const names = openings.map((o) => [o.entry.name, o.entry.eco, o.entry.source]);
		expect(names).toContainEqual(['Sicilian Defense: Najdorf, 6.Bg5', 'B94', 'scid']);
		expect(names).toContainEqual(['Sicilian Defense: Najdorf Variation, English Attack', 'B90', 'wikibooks']);
		expect(openings.find((o) => o.entry.name === 'Sicilian Defense: Najdorf Variation')!.entry.aliases).toBeUndefined();
		expect(stats.bySource.scid).toMatchObject({ new: 1, merged: 1 });
		expect(stats.bySource.wikibooks).toMatchObject({ new: 1, notNew: 1 });
		// Every move line once.
		const lines = openings.map((o) => o.entry.uci.join(' '));
		expect(new Set(lines).size).toBe(lines.length);
	});
});

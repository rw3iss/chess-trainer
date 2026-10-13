import { describe, expect, it } from 'vitest';
import { buildNotes, cleanExtract, collectPrefixes, wikibooksTitle, wikibooksUrl, type NotesCache } from '../src/notes-lib.js';
import { computePopularity, explorerUrl, type PopRow } from '../src/popularity-lib.js';
import { miniMerge } from './helpers.js';

describe('wikibooks titles', () => {
	it('formats move paths', () => {
		expect(wikibooksTitle(['e4', 'e5', 'Nf3'])).toBe('Chess Opening Theory/1. e4/1...e5/2. Nf3');
		expect(wikibooksTitle(['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+'])).toBe(
			'Chess Opening Theory/1. e4/1...e6/2. d4/2...d5/3. Nc3/3...Bb4/4. e5/4...c5/5. a3/5...Bxc3',
		);
		expect(wikibooksUrl('Chess Opening Theory/1. e4/1...e5')).toBe('https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...e5');
	});

	it('collects unique prefixes with EPDs', () => {
		const prefixes = collectPrefixes(miniMerge().openings);
		expect(prefixes.get('Chess Opening Theory/1. e4')!.epd).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -');
		expect([...prefixes.keys()].filter((t) => t.split('/').length === 2).sort()).toEqual([
			'Chess Opening Theory/1. Nf3',
			'Chess Opening Theory/1. d4',
			'Chess Opening Theory/1. e4',
		]);
	});
});

describe('cleanExtract', () => {
	const raw = `
== 4. Ba4 ==
White chooses to keep their bishop. They keep the pressure on Black's knight, and indirectly on the e5 pawn.
This page is a stub. You can help Wikibooks by expanding it.


=== Develop the kingside ===
Black's main priority should be to develop their kingside and castle.

=== Empty section ===

== Theory table ==
.
1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4

== References ==
Kasparov, Garry`;

	it('drops title heading, boilerplate, empty and trailing reference sections', () => {
		const text = cleanExtract(raw);
		expect(text).toBe(
			"White chooses to keep their bishop. They keep the pressure on Black's knight, and indirectly on the e5 pawn.\n\n**Develop the kingside**\nBlack's main priority should be to develop their kingside and castle.",
		);
	});

	it('caps length at a sentence boundary', () => {
		const long = Array.from({ length: 100 }, (_, i) => `Sentence number ${i} explains a plan.`).join(' ');
		const text = cleanExtract(long, 300);
		expect(text.length).toBeLessThanOrEqual(302);
		expect(text.endsWith('plan. …')).toBe(true);
	});

	it('returns empty for stubs', () => {
		expect(cleanExtract('== 1. a3 ==\nThis page is a stub.\n== References ==')).toBe('');
	});
});

describe('buildNotes', () => {
	it('keys notes by EPD via resolved (redirect) titles', () => {
		const prefixes = collectPrefixes(miniMerge().openings);
		const t = 'Chess Opening Theory/1. Nf3/1...d5/2. d4';
		const target = 'Chess Opening Theory/1. d4/1...d5/2. Nf3';
		const cache: NotesCache = {
			info: new Map([[t, { title: t, exists: true, resolved: target }]]),
			extracts: new Map([[target, '== 2. Nf3 ==\nA flexible move that keeps options open for White and avoids the sharpest main lines.']]),
		};
		const notes = buildNotes(prefixes, cache);
		expect(notes.size).toBe(1);
		const [epd, note] = [...notes][0]!;
		expect(epd).toBe(prefixes.get(t)!.epd);
		expect(note.url).toBe('https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._d4/1...d5/2._Nf3');
		expect(note.source).toMatch(/Wikibooks/);
	});
});

describe('popularity', () => {
	it('builds explorer URLs', () => {
		expect(explorerUrl('lichess', ['e2e4', 'e7e5'])).toBe(
			'https://explorer.lichess.org/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500&moves=0&topGames=0&recentGames=0&play=e2e4,e7e5',
		);
		expect(explorerUrl('masters', ['d2d4'])).toBe('https://explorer.lichess.org/masters?moves=0&topGames=0&play=d2d4');
	});

	it('computes percentages and a monotonic 0..100 score', () => {
		const row = (epd: string, w: number, d: number, b: number): [string, PopRow] => [epd, { epd, white: w, draws: d, black: b, t: 0 }];
		const lichess = new Map([row('a', 500, 200, 300), row('b', 5, 0, 5), row('c', 50_000, 10_000, 40_000), row('z', 0, 0, 0)]);
		const pop = computePopularity(lichess, new Map([row('a', 1, 2, 1)]));
		expect(pop.get('a')).toMatchObject({ games: 1000, white: 50, draws: 20, black: 30, mastersGames: 4 });
		const scores = ['z', 'b', 'a', 'c'].map((k) => pop.get(k)!.score);
		expect(scores).toEqual([...scores].sort((x, y) => x - y));
		expect(pop.get('c')!.score).toBe(Math.round(100 * (0.5 * (3.5 / 4) + 0.5)));
		expect(pop.get('z')).toMatchObject({ games: 0, white: 0, score: Math.round(100 * 0.5 * (0.5 / 4)) });
	});
});

describe('cleanExtract headings', () => {
	it('drops a level-1 title heading too', () => {
		expect(cleanExtract('= English Opening =\nA transpositional move. 2... c4 transposes to the Old Indian Defense while 2. Nc3 stays in the English.')).toBe(
			'A transpositional move. 2... c4 transposes to the Old Indian Defense while 2. Nc3 stays in the English.',
		);
	});
});

describe('cleanExtract leading headings', () => {
	it('drops every heading before the first body line', () => {
		expect(cleanExtract('= Petrov =\n\n== 6...d5! ==\nd5! simultaneously defends the e4-knight and attacks the c4-bishop, a key resource.')).toBe(
			'd5! simultaneously defends the e4-knight and attacks the c4-bishop, a key resource.',
		);
	});
});

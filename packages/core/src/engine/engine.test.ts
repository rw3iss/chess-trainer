import { describe, expect, it } from 'vitest';
import { applyUci } from '../chess/position.js';
import { INITIAL_FEN } from '../chess/types.js';
import { ENGINE_CATALOG, engineMeta } from './catalog.js';
import { MAIA_BUCKETS, THINK_PRESET_MS, lc0Nodes, nearestMaiaBucket, resolveStrength } from './strength.js';
import {
	buildGoCommand,
	buildPositionCommand,
	formatScore,
	parseBestMove,
	parseInfoLine,
	pickBlunderMove,
	scoreToWinProbability,
	setOptionCommands,
	toWhitePov,
} from './uci.js';

const meta = (id: string) => engineMeta(id)!;
const normal = { preset: 'normal' } as const;

describe('catalog', () => {
	it('has every planned engine with pros and cons', () => {
		expect(ENGINE_CATALOG.map((e) => e.id)).toEqual([
			'sf-lite', 'sf-full', 'maia', 'fairy', 'sf-native', 'lc0', 'maia-remote', 'komodo',
		]);
		for (const e of ENGINE_CATALOG) {
			expect(e.pros.length).toBeGreaterThan(0);
			expect(e.cons.length).toBeGreaterThan(0);
			expect(e.eloRange[0]).toBeLessThan(e.eloRange[1]);
		}
		expect(new Set(ENGINE_CATALOG.map((e) => e.id)).size).toBe(ENGINE_CATALOG.length);
	});
});

describe('resolveStrength', () => {
	it('think presets and custom movetime', () => {
		expect(THINK_PRESET_MS).toEqual({ instant: 50, fast: 300, normal: 1000, deep: 3000 });
		expect(resolveStrength(meta('sf-lite'), 2000, { preset: 'deep' }).go.movetimeMs).toBe(3000);
		expect(resolveStrength(meta('sf-lite'), 2000, { movetimeMs: 1234 }).go.movetimeMs).toBe(1234);
		expect(resolveStrength(meta('sf-lite'), 2000, normal).minDelayMs).toBeGreaterThan(0);
	});

	it('stockfish >= 1320 uses UCI_Elo', () => {
		const p = resolveStrength(meta('sf-lite'), 1320, normal);
		expect(p.options).toEqual({ UCI_LimitStrength: true, UCI_Elo: 1320 });
		expect(p.blunderChance).toBe(0);
		expect(resolveStrength(meta('sf-native'), 2500, normal).options.UCI_Elo).toBe(2500);
	});

	it('stockfish at/above max or no target plays full strength', () => {
		expect(resolveStrength(meta('sf-full'), 3190, normal).options.UCI_LimitStrength).toBe(false);
		expect(resolveStrength(meta('sf-full'), undefined, normal).options.UCI_LimitStrength).toBe(false);
	});

	it('stockfish < 1320 uses Skill 0, low depth and a rising blunder blend', () => {
		const p1319 = resolveStrength(meta('sf-lite'), 1319, normal);
		expect(p1319.options).toEqual({ UCI_LimitStrength: false, 'Skill Level': 0 });
		expect(p1319.options.UCI_Elo).toBeUndefined();
		expect(p1319.blunderChance).toBeGreaterThanOrEqual(0);
		expect(p1319.blunderChance).toBeLessThan(0.01);
		const p800 = resolveStrength(meta('sf-lite'), 800, normal);
		const p400 = resolveStrength(meta('sf-lite'), 400, normal);
		const p100 = resolveStrength(meta('sf-lite'), 100, normal);
		expect(p800.blunderChance).toBeGreaterThan(p1319.blunderChance);
		expect(p400.blunderChance).toBeCloseTo(0.5, 5);
		expect(p100.blunderChance).toBeCloseTo(0.5, 5);
		expect(p400.go.depth).toBe(1);
		expect(p1319.go.depth!).toBeGreaterThan(p400.go.depth!);
		expect(p400.go.nodes!).toBeLessThan(p1319.go.nodes!);
	});

	it('komodo uses "UCI Elo" with a space and "UCI LimitStrength"', () => {
		const p = resolveStrength(meta('komodo'), 1500, normal);
		expect(p.options).toEqual({ 'UCI LimitStrength': true, 'UCI Elo': 1500 });
		expect(p.options.UCI_Elo).toBeUndefined();
	});

	it('lc0 nodes curve', () => {
		expect(lc0Nodes(1500)).toBe(1);
		expect(lc0Nodes(2200)).toBe(1);
		expect(lc0Nodes(2600)).toBe(10);
		expect(lc0Nodes(3000)).toBe(100);
		const p = resolveStrength(meta('lc0'), 2600, normal);
		expect(p.go.nodes).toBe(10);
		expect(p.blunderChance).toBe(0);
		expect(resolveStrength(meta('lc0'), 1800, normal).blunderChance).toBeGreaterThan(0);
	});

	it('maia picks the nearest bucket with small temperature', () => {
		expect(MAIA_BUCKETS).toEqual([1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]);
		expect(nearestMaiaBucket(1149)).toBe(1100);
		expect(nearestMaiaBucket(1150)).toBe(1200);
		expect(nearestMaiaBucket(500)).toBe(1100);
		expect(nearestMaiaBucket(2400)).toBe(1900);
		const p = resolveStrength(meta('maia'), 1530, normal);
		expect(p.ratingBucket).toBe(1500);
		expect(p.temperature).toBeGreaterThan(0);
		expect(p.temperature).toBeLessThanOrEqual(0.2);
		expect(p.blunderChance).toBe(0);
		expect(resolveStrength(meta('maia-remote'), 1700, normal).go.nodes).toBe(1);
		expect(resolveStrength(meta('maia'), 800, normal).blunderChance).toBeGreaterThan(0);
	});

	it('fairy maps Elo to Skill Level', () => {
		const lo = resolveStrength(meta('fairy'), 500, normal);
		const hi = resolveStrength(meta('fairy'), 2800, normal);
		expect(lo.options['Skill Level']).toBe(0);
		expect(hi.options['Skill Level']).toBe(20);
		expect(lo.go.depth).toBeDefined();
	});
});

describe('UCI parsing', () => {
	it('parses a full info line', () => {
		const i = parseInfoLine(
			'info depth 20 seldepth 28 multipv 2 score cp -35 nodes 123456 nps 987654 hashfull 12 tbhits 0 time 125 pv e7e5 g1f3 b8c6',
		)!;
		expect(i).toEqual({
			depth: 20,
			seldepth: 28,
			multipv: 2,
			score: { cp: -35 },
			nodes: 123456,
			nps: 987654,
			timeMs: 125,
			pv: ['e7e5', 'g1f3', 'b8c6'],
		});
	});

	it('parses bounds, mate scores, wdl and defaults multipv to 1', () => {
		expect(parseInfoLine('info depth 10 score cp 50 upperbound nodes 10 pv e2e4')!.score).toEqual({ cp: 50, bound: 'upper' });
		expect(parseInfoLine('info depth 10 score cp 50 lowerbound')!.score).toEqual({ cp: 50, bound: 'lower' });
		const m = parseInfoLine('info depth 30 score mate -3 wdl 0 0 1000 pv a7a8q')!;
		expect(m.score).toEqual({ mate: -3 });
		expect(m.multipv).toBe(1);
		expect(m.pv).toEqual(['a7a8q']);
	});

	it('returns null for string/currmove/non-info lines', () => {
		expect(parseInfoLine('info string NNUE evaluation using nn-xyz.nnue enabled')).toBeNull();
		expect(parseInfoLine('info depth 12 currmove e2e4 currmovenumber 1')).toBeNull();
		expect(parseInfoLine('bestmove e2e4')).toBeNull();
		expect(parseInfoLine('')).toBeNull();
		expect(parseInfoLine('info depth 5 score')).toBeNull();
	});

	it('parses bestmove', () => {
		expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ uci: 'e2e4', ponder: 'e7e5' });
		expect(parseBestMove('bestmove e7e8q')).toEqual({ uci: 'e7e8q' });
		expect(parseBestMove('bestmove (none)')).toBeNull();
		expect(parseBestMove('bestmove 0000')).toBeNull();
		expect(parseBestMove('info depth 1')).toBeNull();
	});

	it('builds commands', () => {
		expect(buildPositionCommand({ fen: INITIAL_FEN, moves: [] })).toBe('position startpos');
		expect(buildPositionCommand({ fen: INITIAL_FEN, moves: ['e2e4', 'e7e5'] })).toBe('position startpos moves e2e4 e7e5');
		const fen = '8/8/8/8/8/8/8/K6k w - - 0 1';
		expect(buildPositionCommand({ fen, moves: [] })).toBe(`position fen ${fen}`);
		expect(buildGoCommand({ movetimeMs: 1000 })).toBe('go movetime 1000');
		expect(buildGoCommand({ depth: 3, nodes: 500, movetimeMs: 200 })).toBe('go depth 3 nodes 500 movetime 200');
		expect(buildGoCommand({})).toBe('go infinite');
		expect(buildGoCommand({ infinite: true, depth: 5 })).toBe('go infinite');
		expect(setOptionCommands({ UCI_LimitStrength: true, 'UCI Elo': 1500, MultiPV: 3 })).toEqual([
			'setoption name UCI_LimitStrength value true',
			'setoption name UCI Elo value 1500',
			'setoption name MultiPV value 3',
		]);
	});
});

describe('scores', () => {
	it('toWhitePov', () => {
		expect(toWhitePov({ cp: 30 }, 'white')).toEqual({ cp: 30 });
		expect(toWhitePov({ cp: 30, bound: 'lower' }, 'black')).toEqual({ cp: -30, bound: 'upper' });
		expect(toWhitePov({ mate: 2 }, 'black')).toEqual({ mate: -2 });
	});

	it('scoreToWinProbability', () => {
		expect(scoreToWinProbability({ cp: 0 })).toBeCloseTo(0.5);
		expect(scoreToWinProbability({ cp: 300 })).toBeGreaterThan(0.7);
		expect(scoreToWinProbability({ cp: -300 })).toBeLessThan(0.3);
		expect(scoreToWinProbability({ mate: 1 })).toBe(1);
		expect(scoreToWinProbability({ mate: -1 })).toBe(0);
	});

	it('formatScore', () => {
		expect(formatScore({ cp: 123 })).toBe('+1.23');
		expect(formatScore({ cp: -40 })).toBe('-0.40');
		expect(formatScore({ cp: 0 })).toBe('0.00');
		expect(formatScore({ mate: 3 })).toBe('#3');
		expect(formatScore({ mate: -2 })).toBe('-#2');
	});
});

describe('pickBlunderMove', () => {
	it('returns the best move when rng >= chance', () => {
		expect(pickBlunderMove(INITIAL_FEN, 'e2e4', 0.3, () => 0.5)).toBe('e2e4');
		expect(pickBlunderMove(INITIAL_FEN, 'e2e4', 0, () => 0)).toBe('e2e4');
	});

	it('returns a legal random move that avoids mate-in-1', () => {
		const fen = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
		for (let i = 0; i < 20; i++) {
			let n = 0;
			const rng = () => (n++ === 0 ? 0 : i / 20);
			const uci = pickBlunderMove(fen, 'b1c3', 0.5, rng);
			expect(applyUci(fen, uci)).not.toBeNull();
			expect(uci).not.toBe('g2g4');
		}
	});
});

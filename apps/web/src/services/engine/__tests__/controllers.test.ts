import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { engineMeta, INITIAL_FEN, type EngineAdapter, type EngineInfo, type EnginePosition, type PlayOptions, type PlayResult } from '@chess/core';
import { BotPlayer } from '../controllers/BotPlayer';
import { Analyzer, type AnalysisState } from '../controllers/Analyzer';
import { EngineAbortError } from '../types';

interface PendingPlay {
	pos: EnginePosition;
	opts: PlayOptions;
	resolve: (r: PlayResult) => void;
	reject: (e: Error) => void;
}

/** Adapter whose play() calls resolve manually; stop() aborts them like the real adapters. */
function fakeAdapter() {
	const plays: PendingPlay[] = [];
	const analyses: { pos: EnginePosition; onInfo: (i: EngineInfo) => void; stopped: boolean }[] = [];
	const adapter = {
		meta: engineMeta('sf-lite')!,
		capabilities: { limitStrength: true, multiPv: true, analysis: true, ponder: false },
		status: 'ready',
		init: async () => undefined,
		newGame: () => undefined,
		play: (pos: EnginePosition, opts: PlayOptions) => new Promise<PlayResult>((resolve, reject) => plays.push({ pos, opts, resolve, reject })),
		analyze: (pos: EnginePosition, _o: unknown, onInfo: (i: EngineInfo) => void) => {
			const a = { pos, onInfo, stopped: false };
			analyses.push(a);
			return () => {
				a.stopped = true;
			};
		},
		stop: vi.fn(() => {
			for (const p of plays.splice(0)) p.reject(new EngineAbortError());
		}),
		dispose: () => undefined,
	} satisfies EngineAdapter;
	return { adapter, plays, analyses };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('BotPlayer', () => {
	it("moves only on the bot's turn and applies the result", async () => {
		const { adapter, plays } = fakeAdapter();
		const moves: string[] = [];
		const applied: string[] = [];
		const bot = new BotPlayer({
			adapter,
			config: { color: 'black', targetElo: 1500, think: { preset: 'fast' } },
			getPosition: () => ({ fen: INITIAL_FEN, moves: [...moves] }),
			applyMove: (uci) => {
				applied.push(uci);
				moves.push(uci);
			},
		});
		bot.sync();
		expect(plays.length).toBe(0); // White to move
		moves.push('e2e4');
		bot.sync();
		expect(plays.length).toBe(1);
		expect(plays[0]!.opts).toEqual({ think: { preset: 'fast' }, targetElo: 1500 });
		expect(bot.thinking).toBe(true);
		bot.sync(); // same position → no duplicate request
		expect(plays.length).toBe(1);
		plays[0]!.resolve({ uci: 'e7e5' });
		await flush();
		expect(applied).toEqual(['e7e5']);
		expect(bot.thinking).toBe(false);
	});

	it('cancels on position change and never applies a stale move', async () => {
		const { adapter, plays } = fakeAdapter();
		let moves = ['e2e4'];
		const applied: string[] = [];
		const errors: Error[] = [];
		const bot = new BotPlayer({
			adapter,
			config: { color: 'black', think: { preset: 'fast' } },
			getPosition: () => ({ fen: INITIAL_FEN, moves }),
			applyMove: (uci) => applied.push(uci),
			onError: (e) => errors.push(e),
		});
		bot.sync();
		const first = plays[0]!;
		moves = ['d2d4']; // user took back and played another move
		bot.sync();
		expect(adapter.stop).toHaveBeenCalledTimes(1);
		expect(plays.length).toBe(1); // the first was rejected + removed; a new one queued
		expect(plays[0]!.pos.moves).toEqual(['d2d4']);
		first.resolve({ uci: 'e7e5' }); // late result for the old position (ignored)
		plays[0]!.resolve({ uci: 'd7d5' });
		await flush();
		expect(applied).toEqual(['d7d5']);
		expect(errors).toEqual([]); // aborts are not errors
	});

	it('does not move when the game is over or disabled; dispose cancels', async () => {
		const { adapter, plays } = fakeAdapter();
		// Fool's mate: White is checkmated, White "to move".
		const mate = { fen: INITIAL_FEN, moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] };
		const bot = new BotPlayer({ adapter, config: { color: 'white', think: { preset: 'fast' } }, getPosition: () => mate, applyMove: () => undefined });
		bot.sync();
		expect(plays.length).toBe(0);
		const pos = { fen: INITIAL_FEN, moves: [] };
		const bot2 = new BotPlayer({ adapter, config: { color: 'white', think: { preset: 'fast' }, enabled: false }, getPosition: () => pos, applyMove: () => undefined });
		bot2.sync();
		expect(plays.length).toBe(0);
		bot2.setConfig({ enabled: true });
		expect(plays.length).toBe(1);
		bot2.dispose();
		expect(adapter.stop).toHaveBeenCalled();
	});

	it('reports engine errors', async () => {
		const { adapter, plays } = fakeAdapter();
		const errors: Error[] = [];
		const bot = new BotPlayer({
			adapter,
			config: { color: 'white', think: { preset: 'fast' } },
			getPosition: () => ({ fen: INITIAL_FEN, moves: [] }),
			applyMove: () => undefined,
			onError: (e) => errors.push(e),
		});
		bot.sync();
		plays[0]!.reject(new Error('worker crashed'));
		await flush();
		expect(errors.map((e) => e.message)).toEqual(['worker crashed']);
	});
});

describe('Analyzer', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	function visibility() {
		const listeners = new Set<() => void>();
		return {
			hidden: false,
			addEventListener: (_t: string, fn: () => void) => listeners.add(fn),
			removeEventListener: (_t: string, fn: () => void) => listeners.delete(fn),
			fire() {
				for (const fn of listeners) fn();
			},
		};
	}

	it('normalises scores to White POV with win probability (black to move)', () => {
		const { adapter, analyses } = fakeAdapter();
		const states: AnalysisState[] = [];
		const an = new Analyzer({ adapter, getPosition: () => ({ fen: INITIAL_FEN, moves: ['e2e4'] }), onUpdate: (s) => states.push(s), options: { multiPv: 2 }, visibility: null });
		an.start();
		expect(analyses.length).toBe(1);
		analyses[0]!.onInfo({ depth: 12, multipv: 1, score: { cp: -40 }, pv: ['e7e5'], nodes: 10, nps: 5 });
		analyses[0]!.onInfo({ depth: 12, multipv: 2, score: { mate: 3 }, pv: ['c7c5'] });
		analyses[0]!.onInfo({ depth: 12, multipv: 3, score: { cp: 0 }, pv: ['a7a6'] }); // beyond multiPv → dropped
		vi.advanceTimersByTime(150);
		const s = states.at(-1)!;
		expect(s.running).toBe(true);
		expect(s.depth).toBe(12);
		expect(s.lines.map((l) => l.multipv)).toEqual([1, 2]);
		expect(s.lines[0]!.score).toEqual({ cp: 40 });
		expect(s.lines[0]!.winProbability).toBeGreaterThan(0.5);
		expect(s.lines[1]!.score).toEqual({ mate: -3 });
		expect(s.lines[1]!.winProbability).toBe(0);
	});

	it('debounces restarts on position change and ignores stale infos', () => {
		const { adapter, analyses } = fakeAdapter();
		let moves: string[] = [];
		const states: AnalysisState[] = [];
		const an = new Analyzer({ adapter, getPosition: () => ({ fen: INITIAL_FEN, moves }), onUpdate: (s) => states.push(s), options: { multiPv: 1, debounceMs: 100 }, visibility: null });
		an.start();
		moves = ['e2e4'];
		an.sync();
		expect(analyses[0]!.stopped).toBe(true);
		moves = ['e2e4', 'e7e5'];
		an.sync();
		vi.advanceTimersByTime(99);
		expect(analyses.length).toBe(1);
		vi.advanceTimersByTime(1);
		expect(analyses.length).toBe(2);
		expect(analyses[1]!.pos.moves).toEqual(['e2e4', 'e7e5']);
		analyses[0]!.onInfo({ depth: 30, multipv: 1, score: { cp: 999 }, pv: ['e2e4'] }); // stale
		vi.advanceTimersByTime(200);
		expect(states.at(-1)!.lines).toEqual([]);
	});

	it('pauses while the document is hidden and resumes when visible', () => {
		const { adapter, analyses } = fakeAdapter();
		const vis = visibility();
		const states: AnalysisState[] = [];
		const an = new Analyzer({ adapter, getPosition: () => ({ fen: INITIAL_FEN, moves: [] }), onUpdate: (s) => states.push(s), options: { multiPv: 1 }, visibility: vis });
		an.start();
		vis.hidden = true;
		vis.fire();
		expect(analyses[0]!.stopped).toBe(true);
		expect(states.at(-1)).toMatchObject({ running: false, paused: true });
		vis.hidden = false;
		vis.fire();
		expect(analyses.length).toBe(2);
		expect(states.at(-1)).toMatchObject({ running: true, paused: false });
		an.dispose();
		expect(analyses[1]!.stopped).toBe(true);
	});
});

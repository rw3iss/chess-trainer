// @vitest-environment node
/**
 * REAL engine: drives the shipped Stockfish 19 lite (single-threaded WASM) through
 * StockfishWorkerAdapter, using the npm package's Node entry as the "worker".
 */
import { afterAll, describe, expect, it } from 'vitest';
import { applyUci, engineMeta, INITIAL_FEN, type EngineInfo } from '@chess/core';
import { StockfishWorkerAdapter } from '../adapters/StockfishWorkerAdapter';
import { Analyzer, type AnalysisState } from '../controllers/Analyzer';
import type { WorkerLike } from '../types';
import { nodeModule } from './nodeApi';

const require = (await nodeModule()).createRequire(import.meta.url);

interface NodeEngine {
	processCommand(cmd: string): void;
	terminate(): void;
	listener: (line: string) => void;
}

/** Wraps the stockfish npm Node engine as a WorkerLike. */
function nodeWorker(): WorkerLike {
	const init = require('stockfish') as (kind: string, onMsg: (l: string) => void) => NodeEngine;
	const w: WorkerLike = {
		onmessage: null,
		onerror: null,
		postMessage: (cmd) => engine.processCommand(cmd),
		terminate: () => engine.terminate(),
	};
	const engine = init('lite-single', (line) => w.onmessage?.({ data: line }));
	return w;
}

const adapter = new StockfishWorkerAdapter(engineMeta('sf-lite')!, { scriptUrl: 'node:stockfish', createWorker: () => nodeWorker() });
afterAll(() => adapter.dispose());

const isLegal = (fen: string, uci: string): boolean => applyUci(fen, uci) !== null;

describe('Stockfish 19 lite — real engine', () => {
	it('handshakes and returns a legal bestmove for the start position', async () => {
		await adapter.init();
		expect(adapter.status).toBe('ready');
		expect(adapter.supportedOptions.has('UCI_Elo')).toBe(true);
		const res = await adapter.play({ fen: INITIAL_FEN, moves: [] }, { think: { movetimeMs: 200 } });
		expect(isLegal(INITIAL_FEN, res.uci)).toBe(true);
		expect(res.info?.depth).toBeGreaterThan(0);
	}, 30_000);

	it('plays an Elo-limited move (UCI_Elo 1500) and a sub-1320 blended move', async () => {
		const pos = { fen: INITIAL_FEN, moves: ['e2e4', 'e7e5', 'g1f3'] };
		const fen = ['e2e4', 'e7e5', 'g1f3'].reduce((f, m) => applyUci(f, m)!.fen, INITIAL_FEN);
		const a = await adapter.play(pos, { targetElo: 1500, think: { preset: 'fast' } });
		expect(isLegal(fen, a.uci)).toBe(true);
		const b = await adapter.play(pos, { targetElo: 600, think: { preset: 'fast' } });
		expect(isLegal(fen, b.uci)).toBe(true);
	}, 30_000);

	it('finds mate in one', async () => {
		// Scholar's mate setup: Qxf7#.
		const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
		const res = await adapter.play({ fen, moves: [] }, { think: { movetimeMs: 300 } });
		expect(res.uci).toBe('h5f7');
	}, 30_000);

	it('streams MultiPV 3 analysis, stops, then plays', async () => {
		const infos: EngineInfo[] = [];
		const stop = adapter.analyze({ fen: INITIAL_FEN, moves: [] }, { multiPv: 3, infinite: true }, (i) => infos.push(i));
		const end = Date.now() + 10_000;
		while (!(infos.some((i) => i.multipv === 3 && i.depth >= 8)) && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
		stop();
		expect(new Set(infos.map((i) => i.multipv))).toEqual(new Set([1, 2, 3]));
		const res = await adapter.play({ fen: INITIAL_FEN, moves: ['d2d4'] }, { think: { movetimeMs: 100 } });
		expect(isLegal(applyUci(INITIAL_FEN, 'd2d4')!.fen, res.uci)).toBe(true);
	}, 30_000);

	it('Analyzer reports White-POV lines (black to move, White up a queen)', async () => {
		// White has an extra queen; Black to move → raw score negative, White POV positive.
		const fen = 'rnb1kbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3';
		let last: AnalysisState | null = null;
		const an = new Analyzer({
			adapter,
			getPosition: () => ({ fen, moves: [] }),
			onUpdate: (s) => (last = s),
			options: { multiPv: 2, throttleMs: 10 },
			visibility: null,
		});
		an.start();
		const end = Date.now() + 10_000;
		while (((last as AnalysisState | null)?.depth ?? 0) < 10 && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
		an.dispose();
		const s = last as unknown as AnalysisState;
		expect(s.lines.length).toBe(2);
		expect(s.lines[0]!.score.cp ?? 0).toBeGreaterThan(300);
		expect(s.lines[0]!.winProbability).toBeGreaterThan(0.8);
	}, 30_000);
});

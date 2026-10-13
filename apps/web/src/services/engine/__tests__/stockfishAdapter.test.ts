import { describe, expect, it } from 'vitest';
import { engineMeta, INITIAL_FEN, legalDests, type EngineInfo } from '@chess/core';
import { StockfishWorkerAdapter } from '../adapters/StockfishWorkerAdapter';
import { isAbortError } from '../types';
import { FakeUciWorker } from './fakeUci';

const meta = engineMeta('sf-lite')!;
const start = { fen: INITIAL_FEN, moves: [] as string[] };

function setup(opts: { rng?: () => number } = {}) {
	const worker = new FakeUciWorker();
	let urls: string[] = [];
	let t = 0;
	const adapter = new StockfishWorkerAdapter(meta, {
		scriptUrl: '/engines/stockfish/sf.js',
		createWorker: (url) => {
			urls.push(url);
			return worker;
		},
		// Each now() call advances 1 s, so the 400 ms human delay never actually sleeps.
		now: () => (t += 1000),
		...opts,
	});
	return { worker, adapter, urls: () => urls };
}

const until = async (cond: () => boolean, ms = 1000): Promise<void> => {
	const end = Date.now() + ms;
	while (!cond()) {
		if (Date.now() > end) throw new Error('timeout');
		await new Promise((r) => setTimeout(r, 1));
	}
};

describe('StockfishWorkerAdapter (fake UCI worker)', () => {
	it('performs the UCI handshake and records options', async () => {
		const { worker, adapter } = setup();
		expect(adapter.status).toBe('idle');
		await adapter.init();
		expect(worker.commands.slice(0, 2)).toEqual(['uci', 'isready']);
		expect(adapter.status).toBe('ready');
		expect(adapter.supportedOptions.has('UCI_Elo')).toBe(true);
	});

	it('passes a wasm override via the worker URL hash', async () => {
		const worker = new FakeUciWorker();
		const urls: string[] = [];
		const a = new StockfishWorkerAdapter(meta, {
			scriptUrl: '/e/sf.js',
			resolveWasmUrl: async () => 'blob:x/1',
			createWorker: (u) => (urls.push(u), worker),
		});
		await a.init();
		expect(urls[0]).toBe(`/e/sf.js#${encodeURIComponent('blob:x/1')}`);
	});

	it('play at 1500 sets UCI_LimitStrength/UCI_Elo, MultiPV 1 and movetime', async () => {
		const { worker, adapter } = setup();
		const res = await adapter.play(start, { targetElo: 1500, think: { preset: 'fast' } });
		expect(res.uci).toBe('e2e4');
		expect(res.info?.depth).toBe(2);
		const c = worker.commands;
		expect(c).toContain('setoption name UCI_LimitStrength value true');
		expect(c).toContain('setoption name UCI_Elo value 1500');
		expect(c).toContain('setoption name MultiPV value 1');
		expect(c).toContain('position startpos');
		expect(c).toContain('go movetime 300');
		expect(c.indexOf('position startpos')).toBeLessThan(c.indexOf('go movetime 300'));
	});

	it('play below 1320 uses Skill 0 + depth/nodes and the blunder blend', async () => {
		const { worker, adapter } = setup({ rng: () => 0 });
		const res = await adapter.play(start, { targetElo: 400, think: { preset: 'normal' } });
		expect(worker.commands).toContain('setoption name Skill Level value 0');
		expect(worker.commands.find((c) => c.startsWith('go '))).toMatch(/^go depth 1 nodes 50 movetime 200$/);
		// rng 0 < blunderChance 0.5 → random legal move replaces the engine move; info dropped.
		const legal = [...legalDests(INITIAL_FEN)].flatMap(([f, ts]) => ts.map((t) => f + t));
		expect(legal).toContain(res.uci);
		if (res.uci !== 'e2e4') expect(res.info).toBeUndefined();
	});

	it('filters options the engine does not support', async () => {
		const { worker, adapter } = setup();
		worker.options = ['MultiPV', 'Skill Level'];
		await adapter.play(start, { targetElo: 1500, think: { preset: 'instant' } });
		expect(worker.commands.some((c) => c.includes('UCI_Elo'))).toBe(false);
	});

	it('streams MultiPV analysis and drains bestmove after stop before the next search', async () => {
		const { worker, adapter } = setup();
		const infos: EngineInfo[] = [];
		const stop = adapter.analyze(start, { multiPv: 3, infinite: true }, (i) => infos.push(i));
		await until(() => infos.length >= 3);
		expect(worker.commands).toContain('setoption name MultiPV value 3');
		expect(worker.commands).toContain('go infinite');
		expect(new Set(infos.map((i) => i.multipv))).toEqual(new Set([1, 2, 3]));
		stop();
		const res = await adapter.play({ fen: INITIAL_FEN, moves: ['e2e4'] }, { think: { preset: 'instant' } });
		expect(res.uci).toBe('e2e4');
		const log = worker.log;
		const stopAt = log.indexOf('> stop');
		const bestAt = log.findIndex((l, i) => i > stopAt && l.startsWith('< bestmove'));
		const nextPos = log.indexOf('> position startpos moves e2e4');
		expect(stopAt).toBeGreaterThan(-1);
		expect(bestAt).toBeGreaterThan(stopAt);
		expect(nextPos).toBeGreaterThan(bestAt);
		// No info from the stopped search leaked after stop.
		const countAtStop = infos.length;
		await new Promise((r) => setTimeout(r, 20));
		expect(infos.length).toBe(countAtStop);
	});

	it('a new play preempts a running infinite analysis', async () => {
		const { worker, adapter } = setup();
		adapter.analyze(start, { multiPv: 1 }, () => undefined);
		await until(() => worker.searching);
		const res = await adapter.play(start, { think: { preset: 'instant' } });
		expect(res.uci).toBe('e2e4');
		expect(worker.commands).toContain('stop');
	});

	it('superseded queued analyses never start', async () => {
		const { worker, adapter } = setup();
		const a: EngineInfo[] = [];
		const b: EngineInfo[] = [];
		adapter.analyze(start, { multiPv: 1, depth: 5 }, (i) => a.push(i));
		adapter.analyze({ fen: INITIAL_FEN, moves: ['d2d4'] }, { multiPv: 1, depth: 5 }, (i) => b.push(i));
		await until(() => b.length > 0);
		expect(worker.commands.filter((c) => c.startsWith('go')).length).toBe(1);
		expect(a.length).toBe(0);
	});

	it('stop() during play rejects with EngineAbortError', async () => {
		const { worker, adapter } = setup();
		worker.searchMs = 10_000;
		const p = adapter.play(start, { think: { preset: 'deep' } });
		await until(() => worker.searching);
		adapter.stop();
		await expect(p).rejects.toSatisfy(isAbortError);
		// Engine is still usable afterwards.
		worker.searchMs = 1;
		await expect(adapter.play(start, { think: { preset: 'instant' } })).resolves.toMatchObject({ uci: 'e2e4' });
	});

	it('newGame sends ucinewgame + isready in queue order', async () => {
		const { worker, adapter } = setup();
		adapter.newGame();
		await adapter.play(start, { think: { preset: 'instant' } });
		const c = worker.commands;
		expect(c.indexOf('ucinewgame')).toBeGreaterThan(-1);
		expect(c.indexOf('ucinewgame')).toBeLessThan(c.indexOf('position startpos'));
	});

	it('worker error rejects in-flight work and sets error status', async () => {
		const { worker, adapter } = setup();
		worker.searchMs = 10_000;
		const p = adapter.play(start, { think: { preset: 'deep' } });
		await until(() => worker.searching);
		worker.onerror?.({ message: 'boom' });
		await expect(p).rejects.toThrow(/boom/);
		expect(adapter.status).toBe('error');
		expect(worker.terminated).toBe(true);
	});

	it('recovers from a crashed worker by starting a fresh one', async () => {
		const workers: FakeUciWorker[] = [];
		let t = 0;
		const adapter = new StockfishWorkerAdapter(meta, {
			scriptUrl: 'x',
			createWorker: () => {
				const w = new FakeUciWorker();
				workers.push(w);
				return w;
			},
			now: () => (t += 1000),
		});
		await adapter.init();
		workers[0]!.onerror?.({ message: 'crash' });
		expect(adapter.status).toBe('error');
		await expect(adapter.play(start, { think: { preset: 'instant' } })).resolves.toMatchObject({ uci: 'e2e4' });
		expect(workers.length).toBe(2);
		expect(adapter.status).toBe('ready');
	});

	it('dispose terminates the worker', async () => {
		const { worker, adapter } = setup();
		await adapter.init();
		adapter.dispose();
		expect(worker.terminated).toBe(true);
		expect(adapter.status).toBe('idle');
	});
});

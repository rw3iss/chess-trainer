import { resolve } from 'path';
import type { EngineInfo } from '@chess/core';
import { EnginePool } from '../../src/modules/engines/engine-pool';
import type { EngineSpec } from '../../src/modules/engines/engine-specs';
import { UciProcess } from '../../src/modules/engines/uci-process';

const FAKE = resolve(__dirname, '../fixtures/fake-uci.js');
const START = 'position startpos';

describe('UciProcess (fake engine)', () => {
	let p: UciProcess;

	beforeEach(async () => {
		p = new UciProcess({ path: FAKE }, 5000);
		await p.start();
	});
	afterEach(() => p.quit());

	it('completes the handshake and records id + options', () => {
		expect(p.alive).toBe(true);
		expect(p.name).toBe('FakeEngine 1.0');
		expect(p.options.has('multipv')).toBe(true);
		expect(p.options.has('skill level')).toBe(true);
	});

	it('parses info lines and bestmove for a limited search', async () => {
		const infos: EngineInfo[] = [];
		const res = await p.go(START, 'go depth 2', (i) => infos.push(i));
		expect(res.uci).toBe('e2e4');
		expect(res.ponder).toBe('e7e5');
		expect(infos.map((i) => i.depth)).toEqual([1, 2]);
		expect(infos[0]).toMatchObject({ multipv: 1, score: { cp: 19 }, pv: ['e2e4', 'e7e5'], nodes: 1000 });
		expect(res.info?.depth).toBe(2);
	});

	it('uses the position moves', async () => {
		expect((await p.go('position startpos moves e2e4', 'go movetime 10')).uci).toBe('e7e5');
	});

	it('streams infinite analysis until stop', async () => {
		const infos: EngineInfo[] = [];
		const done = p.go(START, 'go infinite', (i) => infos.push(i));
		await new Promise((r) => setTimeout(r, 120));
		expect(p.searching).toBe(true);
		p.stop();
		const res = await done;
		expect(res.uci).toBe('e2e4');
		expect(infos.length).toBeGreaterThan(1);
		expect(p.searching).toBe(false);
	});

	it('sends only options the engine advertises', async () => {
		const lines: string[] = [];
		p.on('line', (l: string) => lines.push(l));
		p.setOptions({ MultiPV: 3, 'Not An Option': 1, 'Skill Level': 5 });
		await p.isReady();
		expect(lines).toContain('info string set MultiPV=3');
		expect(lines).toContain('info string set Skill Level=5');
		expect(lines.some((l) => l.includes('Not An Option'))).toBe(false);
	});

	it('a new go stops the running search first', async () => {
		const first = p.go(START, 'go infinite');
		await new Promise((r) => setTimeout(r, 40));
		const second = await p.go('position startpos moves e2e4', 'go depth 1');
		expect((await first).uci).toBe('e2e4');
		expect(second.uci).toBe('e7e5');
	});

	it('rejects pending work when the process exits', async () => {
		const pending = p.go(START, 'go infinite');
		p.quit();
		await expect(pending).rejects.toThrow(/exited/);
		expect(p.alive).toBe(false);
	});
});

describe('UciProcess failures', () => {
	it('fails to start a missing binary', async () => {
		await expect(new UciProcess({ path: '/nonexistent/engine' }, 1000).start()).rejects.toThrow();
	});
});

describe('EnginePool', () => {
	const spec = { meta: { id: 'sf-native' }, path: FAKE, args: [], initOptions: { Threads: 1 }, available: true } as unknown as EngineSpec;

	it('reuses released processes, enforces the cap, and kills by owner', async () => {
		const pool = new EnginePool(2, 60_000);
		const a = await pool.acquire(spec, 'sock1');
		const b = await pool.acquire(spec, 'sock1');
		expect(pool.size).toBe(2);
		await expect(pool.acquire(spec, 'sock2')).rejects.toThrow(/busy/);
		pool.release(a);
		const c = await pool.acquire(spec, 'sock2');
		expect(c).toBe(a); // reused
		pool.releaseOwner('sock1');
		expect(pool.size).toBe(1);
		expect(pool.countOwned('sock2')).toBe(1);
		await new Promise((r) => setTimeout(r, 100));
		expect(b.alive).toBe(false); // owner's process was quit
		pool.shutdown();
		expect(pool.size).toBe(0);
	});

	it('reaps idle processes', async () => {
		const pool = new EnginePool(2, 1000);
		const a = await pool.acquire(spec, 'x');
		pool.release(a);
		pool.reap(Date.now() + 5000);
		expect(pool.size).toBe(0);
		pool.shutdown();
	});
});

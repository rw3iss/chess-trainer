// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { EngineAdapter, RemoteEngineDto } from '@chess/core';
import { EngineAssetStore, type CacheStorageLike } from '../assetStore';
import { EngineRegistry, type EngineManifest } from '../registry';
import { StockfishWorkerAdapter } from '../adapters/StockfishWorkerAdapter';
import { MaiaAdapter } from '../adapters/MaiaAdapter';
import { RemoteEngineAdapter } from '../adapters/RemoteEngineAdapter';
import { engineAssetUrl } from '../util';

/** Map-backed CacheStorage. */
function memCaches(): CacheStorageLike {
	const caches = new Map<string, Map<string, Response>>();
	return {
		open: async (name: string) => {
			if (!caches.has(name)) caches.set(name, new Map());
			const m = caches.get(name)!;
			return {
				match: async (url: string) => m.get(url)?.clone(),
				put: async (url: string, res: Response) => {
					// Consume the stream like a real cache would.
					const buf = await res.arrayBuffer();
					m.set(url, new Response(buf, { headers: res.headers }));
				},
				delete: async (url: string) => m.delete(url),
			} as unknown as Cache;
		},
	};
}

const manifest: EngineManifest = {
	engines: {
		'sf-lite': { script: 'stockfish/sf-lite.js', wasm: 'stockfish/sf-lite.wasm', totalBytes: 1_874_201, onDemand: false, files: [] },
		'sf-full': {
			script: 'stockfish-full/sf.js',
			wasm: 'stockfish-full/sf.wasm',
			totalBytes: 3000,
			onDemand: true,
			files: [
				{ path: 'stockfish-full/sf.js', bytes: 1000 },
				{ path: 'stockfish-full/sf.wasm', bytes: 2000 },
			],
		},
	},
};

function fakeFetch(): typeof fetch {
	return (async (url: string) => {
		const size = url.endsWith('.wasm') ? 2000 : 1000;
		return new Response(new Uint8Array(size), { headers: { 'content-length': String(size) } });
	}) as unknown as typeof fetch;
}

const remoteDtos: RemoteEngineDto[] = [
	{ ...({} as RemoteEngineDto), id: 'sf-native', name: 'SF native', family: 'stockfish', kind: 'remote', description: '', eloRange: [400, 3190], humanLike: false, license: 'GPL-3.0', pros: [], cons: [], available: true },
	{ ...({} as RemoteEngineDto), id: 'komodo', name: 'Komodo', family: 'komodo', kind: 'remote', description: '', eloRange: [400, 3400], humanLike: false, license: 'x', pros: [], cons: [], available: false, reason: 'binary not found' },
];

function make(extra: ConstructorParameters<typeof EngineRegistry>[0] = {}) {
	const store = new EngineAssetStore('test', fakeFetch(), memCaches());
	return new EngineRegistry({ store, loadManifest: async () => manifest, idleDisposeMs: 1000, ...extra });
}

const byId = async (r: EngineRegistry, id: string) => (await r.list()).find((e) => e.meta.id === id)!;

describe('EngineRegistry', () => {
	it('local availability: lite ready, full needs download, maia model missing, fairy missing', async () => {
		const r = make();
		const list = await r.list();
		const get = (id: string) => list.find((e) => e.meta.id === id)!;
		expect(get('sf-lite').availability).toMatchObject({ available: true, installed: true });
		expect(get('sf-lite').meta.sizeMb).toBe(1.8);
		expect(get('sf-full').availability).toMatchObject({ available: false, reason: 'needs-download', downloadable: true });
		expect(get('maia').availability).toMatchObject({ available: false, reason: 'model-missing', downloadable: true });
		expect(get('maia').meta.name).toMatch(/Maia-2/);
		expect(get('fairy').availability).toMatchObject({ available: false, reason: 'binary-missing' });
	});

	it('without a manifest the stockfish builds are binary-missing', async () => {
		const r = make({ loadManifest: async () => null });
		expect((await byId(r, 'sf-lite')).availability.reason).toBe('binary-missing');
	});

	it('remote engines: needs-server offline; server list + reasons online', async () => {
		const offline = make();
		expect((await byId(offline, 'sf-native')).availability.reason).toBe('needs-server');
		const api = { listEngines: vi.fn(async () => remoteDtos) };
		const online = make({ api, remote: { serverUrl: 'http://x' } });
		expect((await byId(online, 'sf-native')).availability.available).toBe(true);
		expect((await byId(online, 'komodo')).availability).toMatchObject({ available: false, reason: 'server-unavailable', message: 'binary not found' });
		expect((await byId(online, 'lc0')).availability.reason).toBe('server-unavailable');
		// API failure → treated as no server.
		const broken = make({ api: { listEngines: async () => Promise.reject(new Error('down')) }, remote: { serverUrl: 'http://x' } });
		expect((await byId(broken, 'sf-native')).availability.reason).toBe('needs-server');
	});

	it('download / remove an on-demand engine with progress', async () => {
		const r = make();
		const changes = vi.fn();
		r.subscribe(changes);
		const progress: number[] = [];
		await r.download('sf-full', (p) => progress.push(p.fraction));
		expect(progress.at(-1)).toBe(1);
		expect(progress.some((f) => f > 0 && f < 1)).toBe(true);
		expect((await byId(r, 'sf-full')).availability).toMatchObject({ available: true, installed: true });
		expect(changes).toHaveBeenCalled();
		await r.remove('sf-full');
		expect((await byId(r, 'sf-full')).availability.reason).toBe('needs-download');
		await expect(r.download('sf-lite')).rejects.toThrow(/not downloadable/);
	});

	it('maia: import a user model file makes it available', async () => {
		const r = make();
		await r.importMaiaModel(new Blob([new Uint8Array(10)]));
		expect((await byId(r, 'maia')).availability.available).toBe(true);
	});

	it('getAdapter lazily constructs the right adapter and caches it', async () => {
		const r = make({ api: { listEngines: async () => remoteDtos }, remote: { serverUrl: 'http://x', token: 't' } });
		await r.list();
		const lite = await r.getAdapter('sf-lite');
		expect(lite).toBeInstanceOf(StockfishWorkerAdapter);
		expect(await r.getAdapter('sf-lite')).toBe(lite);
		expect(await r.getAdapter('maia')).toBeInstanceOf(MaiaAdapter);
		expect(await r.getAdapter('sf-native')).toBeInstanceOf(RemoteEngineAdapter);
		await expect(r.getAdapter('nope')).rejects.toThrow(/unknown engine/);
	});

	it('sf-full adapter gets its wasm from Cache Storage as a blob URL', async () => {
		const workers: string[] = [];
		const r = make({
			stockfish: {
				createWorker: (url) => {
					workers.push(url);
					throw new Error('stop here');
				},
			},
		});
		const full = await r.getAdapter('sf-full');
		await expect(full.init()).rejects.toThrow(/not downloaded/);
		await r.download('sf-full');
		const full2 = await r.getAdapter('sf-full');
		await expect(full2.init()).rejects.toThrow(/stop here/);
		expect(workers[0]).toMatch(new RegExp(`^${engineAssetUrl('stockfish-full/sf.js').replace(/[.?]/g, '\\$&')}#blob%3A`));
	});

	it('disposes idle adapters (not busy ones)', async () => {
		const disposed: string[] = [];
		const fake = (id: string, status: EngineAdapter['status']): EngineAdapter =>
			({ meta: { id }, status, dispose: () => disposed.push(id) }) as unknown as EngineAdapter;
		const r = make({ factories: { a: () => fake('a', 'ready'), b: () => fake('b', 'busy') } });
		await r.getAdapter('a');
		await r.getAdapter('b');
		r.disposeIdle(Date.now() + 5000);
		expect(disposed).toEqual(['a']);
		r.dispose();
		expect(disposed).toEqual(['a', 'b']);
	});
});

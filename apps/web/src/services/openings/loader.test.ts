import { describe, expect, it } from 'vitest';
import { FIXTURE_MANIFEST, FIXTURE_OPENINGS, fixtureFetch, memoryCaches } from './__fixtures__/dataset';
import { DatasetError, loadManifest, loadNotesChunk, loadOpeningsDataset, pruneDatasetCache, validateManifest, type DatasetSource } from './loader';

function source(overrides?: Record<string, unknown>, caches: CacheStorage | null = memoryCaches()): DatasetSource & { calls: string[] } {
	const f = fixtureFetch(overrides);
	return { baseUrl: '/data', fetch: f.fetch, caches, calls: f.calls };
}

describe('openings dataset loader', () => {
	it('loads manifest → openings + graph', async () => {
		const src = source();
		const ds = await loadOpeningsDataset(src);
		expect(ds.manifest.files.openings).toBe(FIXTURE_MANIFEST.files.openings);
		expect(ds.openings.openings).toHaveLength(FIXTURE_OPENINGS.openings.length);
		expect(JSON.parse(ds.openingsText)).toEqual(FIXTURE_OPENINGS);
		expect(ds.graph.epd.length).toBeGreaterThan(0);
		expect(src.calls).toEqual(['/data/manifest.json', '/data/openings.v1.aaaa.json', '/data/graph.v1.bbbb.json']);
	});

	it('serves hashed files from Cache Storage on the next load', async () => {
		const caches = memoryCaches();
		await loadOpeningsDataset(source(undefined, caches));
		const second = source(undefined, caches);
		await loadOpeningsDataset(second);
		expect(second.calls).toEqual(['/data/manifest.json']);
	});

	it('falls back to the cached manifest when offline', async () => {
		const caches = memoryCaches();
		await loadOpeningsDataset(source(undefined, caches));
		const offline = source({ '/data/manifest.json': new TypeError('Failed to fetch') }, caches);
		const ds = await loadOpeningsDataset(offline);
		expect(ds.openings.openings.length).toBe(FIXTURE_OPENINGS.openings.length);
	});

	it('errors clearly when nothing is available', async () => {
		await expect(loadManifest(source({ '/data/manifest.json': new TypeError('Failed to fetch') }, null))).rejects.toBeInstanceOf(DatasetError);
		await expect(loadOpeningsDataset(source({ '/data/openings.v1.aaaa.json': undefined, '/data/manifest.json': { ...FIXTURE_MANIFEST, files: { ...FIXTURE_MANIFEST.files, openings: 'missing.json' } } }, null))).rejects.toThrow(/missing\.json/);
	});

	it('validates the manifest version and shape', () => {
		expect(() => validateManifest({ ...FIXTURE_MANIFEST, version: 2 })).toThrow(/Unsupported/);
		expect(() => validateManifest({ version: 1 })).toThrow(/Malformed/);
		expect(validateManifest({ ...FIXTURE_MANIFEST, files: { openings: 'a', graph: 'b' } }).files.notes).toEqual({});
	});

	it('loads notes chunks; unknown letters are empty', async () => {
		const src = source();
		const b = await loadNotesChunk(FIXTURE_MANIFEST, 'B', src);
		expect(Object.keys(b.notes)).toHaveLength(1);
		expect((await loadNotesChunk(FIXTURE_MANIFEST, 'E', src)).notes).toEqual({});
	});

	it('prunes cached files the manifest no longer lists', async () => {
		const caches = memoryCaches();
		const src = source(undefined, caches);
		await loadOpeningsDataset(src);
		const cache = await caches.open('x');
		await cache.put('/data/openings.v1.old.json', new Response('{}'));
		expect(await pruneDatasetCache(FIXTURE_MANIFEST, src)).toBe(1);
		expect(await cache.match('/data/openings.v1.old.json')).toBeUndefined();
		expect(await cache.match('/data/openings.v1.aaaa.json')).toBeDefined();
	});
});

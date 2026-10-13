import { beforeEach, describe, expect, it } from 'vitest';
import { FIXTURE_OPENINGS, fixtureFetch } from '@/services/openings/__fixtures__/dataset';
import { openingIdentifier } from '@/state/openingIdentity';
import {
	loadDatasetNote,
	loadOpenings,
	loadRecentOpenings,
	markOpeningViewed,
	openingFamilies,
	openingIndex,
	openingSearch,
	openingsError,
	openingsReady,
	openingsStatus,
	recentOpeningIds,
	resetOpeningsState,
} from '@/state/openings';
import { freshRepositories } from './testDb';

const source = () => ({ baseUrl: '/data', fetch: fixtureFetch().fetch, caches: null });

describe('openings store', () => {
	beforeEach(() => {
		freshRepositories();
		resetOpeningsState();
	});

	it('loads the dataset, builds the index + search and wires the opening identifier', async () => {
		expect(openingIndex.value).toBeNull();
		const p = loadOpenings({ source: source(), search: { local: true } });
		expect(openingsStatus.value).toBe('loading');
		await p;
		expect(openingsReady.value).toBe(true);
		expect(openingIndex.value!.all()).toHaveLength(FIXTURE_OPENINGS.openings.length);
		expect(openingFamilies.value.find((f) => f.name === 'Ruy Lopez')?.count).toBe(3);
		expect(openingIdentifier.value?.(['e2e4', 'c7c5', 'g1f3'])?.name).toBe('Sicilian Defense');
		const r = await openingSearch()!.query({ q: 'ruy' });
		expect(r.length).toBe(3);
	});

	it('is idempotent and reports errors', async () => {
		const a = loadOpenings({ source: source(), search: { local: true } });
		expect(loadOpenings()).toBe(a);
		await a;
		resetOpeningsState();
		await loadOpenings({ source: { baseUrl: '/data', fetch: fixtureFetch({ '/data/manifest.json': undefined }).fetch, caches: null } });
		expect(openingsStatus.value).toBe('error');
		expect(openingsError.value).toMatch(/manifest/);
	});

	it('loads dataset notes lazily by position', async () => {
		await loadOpenings({ source: source(), search: { local: true } });
		const note = await loadDatasetNote('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
		expect(note?.text).toMatch(/Sicilian/);
		expect(note?.url).toMatch(/wikibooks/);
		expect(await loadDatasetNote('8/8/8/8/8/8/8/K6k w - - 0 1')).toBeUndefined();
	});

	it('tracks and restores recently viewed openings', async () => {
		markOpeningViewed('a');
		markOpeningViewed('b');
		markOpeningViewed('a');
		expect(recentOpeningIds.value).toEqual(['a', 'b']);
		await new Promise((r) => setTimeout(r, 20));
		resetOpeningsState();
		expect(recentOpeningIds.value).toEqual([]);
		await loadRecentOpenings();
		expect(recentOpeningIds.value).toEqual(['a', 'b']);
	});
});

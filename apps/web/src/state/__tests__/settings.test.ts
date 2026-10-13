import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, deepMerge, flushStores, loadSettings, resetSettings, settings, updateSettings } from '@/state';
import { freshRepositories } from './testDb';

describe('settings store', () => {
	let repos: ReturnType<typeof freshRepositories>['repos'];
	beforeEach(() => {
		repos = freshRepositories().repos;
		resetSettings();
	});

	it('deepMerge merges objects and replaces leaves/arrays', () => {
		expect(deepMerge({ a: { b: 1, c: 2 }, d: [1] }, { a: { c: 3 }, d: [2, 3] })).toEqual({ a: { b: 1, c: 3 }, d: [2, 3] });
	});

	it('updates a nested section and persists it; reload merges with defaults', async () => {
		updateSettings({ board: { coordinates: 'outside' }, playback: { fast: 250 } });
		expect(settings.value.board.coordinates).toBe('outside');
		expect(settings.value.board.showLegalDots).toBe(DEFAULT_SETTINGS.board.showLegalDots);
		await flushStores();
		await new Promise((r) => setTimeout(r, 20));
		const stored = await repos.settings.get<typeof DEFAULT_SETTINGS>('app');
		expect(stored?.playback.fast).toBe(250);
		resetSettings();
		await repos.settings.set('app', { board: { coordinates: 'none' } });
		await loadSettings();
		expect(settings.value.board.coordinates).toBe('none');
		expect(settings.value.playback.slow).toBe(2000);
	});

	it('mirrors theme to localStorage for flash-free boot', () => {
		updateSettings({ theme: { mode: 'light' } });
		expect(JSON.parse(localStorage.getItem('chess:theme-boot')!).mode).toBe('light');
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';
import { uiStorage } from '@/lib/storage';

const games = signal<unknown[]>([]);
const loaded = signal(false);
vi.mock('@/state/savedGames', () => ({ savedGames: games, savedGamesLoaded: loaded }));

const { requestPersistentStorage, watchFirstSaveForPersistence } = await import('./persist');

describe('storage persistence', () => {
	let persist: ReturnType<typeof vi.fn>;
	beforeEach(() => {
		uiStorage.remove('storage-persist-requested');
		games.value = [];
		loaded.value = false;
		persist = vi.fn(() => Promise.resolve(true));
		Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist, persisted: () => Promise.resolve(false) } });
	});
	afterEach(() => vi.restoreAllMocks());

	it('asks once and remembers', async () => {
		expect(await requestPersistentStorage()).toBe('granted');
		expect(await requestPersistentStorage()).toBe('already-asked');
		expect(persist).toHaveBeenCalledOnce();
	});

	it('requests only after the first save following load', async () => {
		const stop = watchFirstSaveForPersistence();
		games.value = [{ id: 'old' }];
		loaded.value = true; // boot restore — not a save
		await Promise.resolve();
		expect(persist).not.toHaveBeenCalled();
		games.value = [{ id: 'old' }, { id: 'new' }];
		await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
		games.value = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		await Promise.resolve();
		expect(persist).toHaveBeenCalledOnce();
		stop();
	});
});

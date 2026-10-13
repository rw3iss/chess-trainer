import { beforeEach, describe, expect, it } from 'vitest';
import { activeSession, resetSessionsState, sessionsActions } from '@/state/sessions';
import { getSavedGame, loadSavedGames, resetSavedGamesState, savedGames, savedGamesActions } from '@/state/savedGames';
import { isFavorite, loadFavorites, resetFavoritesState, toggleFavorite } from '@/state/favorites';
import { freshRepositories } from './testDb';

describe('savedGames + favorites stores', () => {
	let repos: ReturnType<typeof freshRepositories>['repos'];
	beforeEach(() => {
		resetSessionsState();
		resetSavedGamesState();
		resetFavoritesState();
		repos = freshRepositories().repos;
	});

	it('first save creates a game and links the session; later saves overwrite', async () => {
		sessionsActions.newSession();
		sessionsActions.move('e2e4');
		const g1 = (await savedGamesActions.save())!;
		expect(activeSession.value!.savedGameId).toBe(g1.id);
		expect(activeSession.value!.dirty).toBe(false);
		sessionsActions.move('e7e5');
		const g2 = (await savedGamesActions.save())!;
		expect(g2.id).toBe(g1.id);
		expect(g2.revision).toBeGreaterThan(g1.revision);
		expect(savedGames.value).toHaveLength(1);
	});

	it('save as creates a new game and re-links the session', async () => {
		sessionsActions.newSession();
		sessionsActions.move('d2d4');
		const g1 = (await savedGamesActions.save())!;
		const g2 = (await savedGamesActions.saveAs(undefined, { name: 'Queen pawn' }))!;
		expect(g2.id).not.toBe(g1.id);
		expect(g2.name).toBe('Queen pawn');
		expect(g2.parentGameId).toBe(g1.id);
		expect(activeSession.value!.savedGameId).toBe(g2.id);
		expect(await repos.savedGames.list()).toHaveLength(2);
	});

	it('rename, duplicate, delete with undo', async () => {
		sessionsActions.newSession();
		const g = (await savedGamesActions.save())!;
		await savedGamesActions.rename(g.id, 'Renamed');
		expect(getSavedGame(g.id)!.name).toBe('Renamed');
		expect(activeSession.value!.title).toBe('Renamed');
		const dup = (await savedGamesActions.duplicate(g.id))!;
		expect(dup.name).toBe('Renamed (copy)');
		const undo = await savedGamesActions.remove(g.id);
		expect(getSavedGame(g.id)).toBeUndefined();
		await undo();
		expect(getSavedGame(g.id)).toBeDefined();
		resetSavedGamesState();
		await loadSavedGames();
		expect(savedGames.value).toHaveLength(2);
	});

	it('favorites toggle for games stays in sync with SavedGame.favorite', async () => {
		sessionsActions.newSession();
		const g = (await savedGamesActions.save())!;
		await savedGamesActions.toggleFavorite(g.id);
		expect(getSavedGame(g.id)!.favorite).toBe(true);
		expect(isFavorite('game', g.id)).toBe(true);
		await toggleFavorite('opening', 'abc');
		resetFavoritesState();
		await loadFavorites();
		expect(isFavorite('opening', 'abc')).toBe(true);
		expect(isFavorite('game', g.id)).toBe(true);
	});

	it('opening a saved game focuses an already-open linked session', async () => {
		const s = sessionsActions.newSession();
		const g = (await savedGamesActions.save())!;
		sessionsActions.newSession();
		const opened = savedGamesActions.open(g.id)!;
		expect(opened.id).toBe(s.id);
		expect(activeSession.value!.id).toBe(s.id);
	});
});

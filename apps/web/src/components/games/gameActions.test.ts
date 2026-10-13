import { beforeEach, describe, expect, it } from 'vitest';
import { toast, toasts } from '@/services/toast';
import { activeSession, openSessions, resetSessionsState, sessionsActions } from '@/state/sessions';
import { getSavedGame, loadSavedGames, resetSavedGamesState, savedGames, savedGamesActions } from '@/state/savedGames';
import { resetFavoritesState } from '@/state/favorites';
import { freshRepositories, sleep } from '@/state/__tests__/testDb';
import { deleteGameWithUndo, duplicateGame, isGameOpen, openGame, renameGame } from './gameActions';

describe('saved game actions', () => {
	beforeEach(() => {
		resetSessionsState();
		resetSavedGamesState();
		resetFavoritesState();
		toast.clear();
		freshRepositories();
	});

	it('delete shows an Undo toast that restores the game (and persists)', async () => {
		sessionsActions.newSession();
		const g = (await savedGamesActions.saveAs(undefined, { name: 'Doomed' }))!;
		await deleteGameWithUndo(g.id);
		expect(getSavedGame(g.id)).toBeUndefined();
		const t = toasts.value.find((x) => x.message.includes('Doomed'))!;
		expect(t.action?.label).toBe('Undo');
		t.action!.onClick();
		await sleep(20);
		expect(getSavedGame(g.id)?.name).toBe('Doomed');
		resetSavedGamesState();
		await loadSavedGames();
		expect(savedGames.value.map((x) => x.id)).toEqual([g.id]);
	});

	it('open focuses the linked session, else opens a new one', async () => {
		const s = sessionsActions.newSession();
		sessionsActions.move('e2e4');
		const g = (await savedGamesActions.saveAs(undefined, { name: 'Linked' }))!;
		sessionsActions.newSession();
		expect(isGameOpen(g.id)).toBe(true);
		openGame(g.id);
		expect(activeSession.value!.id).toBe(s.id);
		sessionsActions.close(s.id);
		expect(isGameOpen(g.id)).toBe(false);
		openGame(g.id);
		expect(activeSession.value!.savedGameId).toBe(g.id);
		expect(openSessions.value).toHaveLength(2);
	});

	it('duplicate and rename', async () => {
		sessionsActions.newSession();
		const g = (await savedGamesActions.saveAs(undefined, { name: 'Base' }))!;
		const copy = (await duplicateGame(g.id))!;
		expect(copy.name).toBe('Base (copy)');
		await renameGame(g.id, '  Renamed  ');
		expect(getSavedGame(g.id)!.name).toBe('Renamed');
		expect(activeSession.value!.title).toBe('Renamed');
	});
});

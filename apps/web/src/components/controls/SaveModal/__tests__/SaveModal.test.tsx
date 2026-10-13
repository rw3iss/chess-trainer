import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { commands } from '@/services/commands';
import { toast, toasts } from '@/services/toast';
import { activeSession, resetSessionsState, sessionsActions } from '@/state/sessions';
import { getSavedGame, resetSavedGamesState, savedGames, savedGamesActions } from '@/state/savedGames';
import { resetFavoritesState } from '@/state/favorites';
import { freshRepositories } from '@/state/__tests__/testDb';
import { SaveModalHost, closeSaveModal, mergeTags, requestSave, saveModalRequest, submitSave } from '@/components/controls/SaveModal';
import { registerGamesFeature } from '@/components/games';

function setup() {
	resetSessionsState();
	resetSavedGamesState();
	resetFavoritesState();
	closeSaveModal();
	toast.clear();
	return freshRepositories().repos;
}

describe('save semantics (store + modal state)', () => {
	let repos: ReturnType<typeof setup>;
	beforeEach(() => {
		repos = setup();
	});

	it('first Save of a session opens the modal as "new"; it never quick-saves', async () => {
		sessionsActions.newSession();
		sessionsActions.move('e2e4');
		await requestSave();
		expect(saveModalRequest.value).toMatchObject({ sessionId: activeSession.value!.id, choice: 'new' });
		expect(savedGames.value).toHaveLength(0);
	});

	it('Save on a linked session overwrites directly (toast, no modal)', async () => {
		sessionsActions.newSession();
		sessionsActions.move('e2e4');
		const g1 = (await submitSave({ sessionId: activeSession.value!.id, choice: 'new', name: 'King pawn', tags: ['e4'], notes: 'first' }))!;
		expect(g1.notes).toBe('first');
		sessionsActions.move('e7e5');
		expect(activeSession.value!.dirty).toBe(true);
		await requestSave();
		expect(saveModalRequest.value).toBeNull();
		const g2 = getSavedGame(g1.id)!;
		expect(g2.revision).toBe(g1.revision + 1);
		expect(g2.tags).toEqual(['e4']);
		expect(g2.notes).toBe('first');
		expect(activeSession.value!.dirty).toBe(false);
		expect(toasts.value.at(-1)!.message).toContain('King pawn');
		expect(await repos.savedGames.list()).toHaveLength(1);
	});

	it('overwrite choice replaces the linked game; "new" makes a copy and re-links', async () => {
		sessionsActions.newSession();
		const sid = activeSession.value!.id;
		const g1 = (await submitSave({ sessionId: sid, choice: 'new', name: 'Base', tags: [], notes: '' }))!;
		sessionsActions.move('d2d4');
		const over = (await submitSave({ sessionId: sid, choice: 'overwrite', name: 'Base v2', tags: ['qp'], notes: '' }))!;
		expect(over.id).toBe(g1.id);
		expect(over.name).toBe('Base v2');
		expect(activeSession.value!.title).toBe('Base v2');
		const copy = (await submitSave({ sessionId: sid, choice: 'new', name: 'Copy', tags: [], notes: 'n' }))!;
		expect(copy.id).not.toBe(g1.id);
		expect(copy.parentGameId).toBe(g1.id);
		expect(activeSession.value!.savedGameId).toBe(copy.id);
		expect(savedGames.value).toHaveLength(2);
	});

	it('"overwrite" on an unlinked session falls back to a new game', async () => {
		sessionsActions.newSession();
		const g = (await submitSave({ sessionId: activeSession.value!.id, choice: 'overwrite', name: 'X', tags: [], notes: '' }))!;
		expect(activeSession.value!.savedGameId).toBe(g.id);
	});

	it('mergeTags trims, dedupes case-insensitively and splits commas', () => {
		expect(mergeTags(['Sharp'], ' sharp, gambit ,, Gambit, main  line ')).toEqual(['Sharp', 'gambit', 'main line']);
	});
});

describe('SaveModalHost', () => {
	let unregister: () => void = () => {};
	beforeEach(() => {
		setup();
		unregister();
		unregister = registerGamesFeature();
	});

	it('registerGamesFeature wires save/saveAs; Save as shows Overwrite vs Save as new copy and saves a copy', async () => {
		render(<SaveModalHost />);
		sessionsActions.newSession();
		sessionsActions.move('e2e4');
		const first = (await savedGamesActions.saveAs(undefined, { name: 'Original' }))!;

		commands.dispatch('saveAs');
		const overwrite = await screen.findByRole('radio', { name: /Overwrite “Original”/ });
		const asNew = screen.getByRole('radio', { name: /Save as new copy/ });
		expect(asNew.getAttribute('aria-checked')).toBe('true');
		expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Original (copy)');

		// Switching to overwrite prefills the linked game's name.
		fireEvent.click(overwrite);
		expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Original');
		fireEvent.click(asNew);
		fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Variation B' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save copy' }));

		await waitFor(() => expect(savedGames.value).toHaveLength(2));
		const copy = savedGames.value.find((g) => g.name === 'Variation B')!;
		expect(copy.parentGameId).toBe(first.id);
		await waitFor(() => expect(saveModalRequest.value).toBeNull());
		expect(activeSession.value!.savedGameId).toBe(copy.id);
	});

	it('first save via the modal: name defaults to the session title; empty name is rejected', async () => {
		render(<SaveModalHost />);
		sessionsActions.newSession();
		commands.dispatch('save');
		const name = (await screen.findByLabelText('Name')) as HTMLInputElement;
		expect(name.value).toBe(activeSession.value!.title);
		expect(screen.queryByRole('radio')).toBeNull();
		fireEvent.input(name, { target: { value: '  ' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save game' }));
		expect(await screen.findByText('Give the game a name')).toBeTruthy();
		fireEvent.input(name, { target: { value: 'My line' } });
		const tags = screen.getByLabelText('Tags');
		fireEvent.input(tags, { target: { value: 'prep,' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save game' }));
		await waitFor(() => expect(savedGames.value).toHaveLength(1));
		expect(savedGames.value[0]!.name).toBe('My line');
		expect(savedGames.value[0]!.tags).toEqual(['prep']);
	});
});

// SaveModal open state + save logic (framework-free; the host component renders it).
//   requestSave()    Ctrl+S — linked session with an existing game → quick overwrite + toast; else modal ("new")
//   requestSaveAs()  Ctrl+⇧+S — modal with "Save as new copy" preselected
//   submitSave(...)  performs overwrite / save-as through savedGamesActions
import { computed, signal } from '@preact/signals';
import { ROOT_ID, getNode, lineEnd, uciPathTo } from '@chess/core/chess';
import { defaultTitle, type SavedGame, type Session } from '@chess/core/game';
import { toast } from '@/services/toast';
import { activeSession, getSession } from '@/state/sessions';
import { getSavedGame, savedGamesActions } from '@/state/savedGames';
import { openingIdentifier } from '@/state/openingIdentity';

export type SaveChoice = 'overwrite' | 'new';

export interface SaveModalRequest {
	sessionId: string;
	choice: SaveChoice;
	/** Increments per open (the host remounts the form for each request). */
	seq: number;
}

let seq = 0;

const _request = signal<SaveModalRequest | null>(null);

/** Current modal request (null = closed). */
export const saveModalRequest = computed(() => _request.value);

export function openSaveModal(sessionId: string, choice: SaveChoice): void {
	_request.value = { sessionId, choice, seq: ++seq };
}

export function closeSaveModal(): void {
	_request.value = null;
}

/** Saved game this session overwrites on "Save" (undefined = first save → always new). */
export function linkedGame(session: Session | null): SavedGame | undefined {
	return session ? getSavedGame(session.savedGameId) : undefined;
}

/** Default name for a new save: the session title, or the identified opening when the title is auto-generated. */
export function suggestedName(session: Session): string {
	if (session.source.kind === 'opening' || session.title !== defaultTitle(session)) return session.title;
	const identify = openingIdentifier.value;
	const root = getNode(session.tree, ROOT_ID);
	const opening = identify?.(uciPathTo(session.tree, lineEnd(session.tree, ROOT_ID)), root.fen);
	return opening?.name ?? session.title;
}

/** Ctrl+S. Quick-saves a linked session; otherwise opens the modal for a first save. */
export async function requestSave(): Promise<void> {
	const s = activeSession.value;
	if (!s) return;
	const linked = linkedGame(s);
	if (!linked) {
		openSaveModal(s.id, 'new');
		return;
	}
	try {
		const g = await savedGamesActions.save(s.id);
		if (g)
			toast.success(`Saved “${g.name}”`, {
				id: 'save',
				action: { label: 'Save as…', onClick: () => openSaveModal(s.id, 'new') },
			});
	} catch (e) {
		toast.error(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
	}
}

/** Ctrl+⇧+S. Always opens the modal with "Save as new copy" selected. */
export function requestSaveAs(): void {
	const s = activeSession.value;
	if (s) openSaveModal(s.id, 'new');
}

export interface SaveSubmit {
	sessionId: string;
	choice: SaveChoice;
	name: string;
	tags: string[];
	notes: string;
}

/** Perform the save. Overwrite falls back to "new" when the session has no linked game. */
export async function submitSave({ sessionId, choice, name, tags, notes }: SaveSubmit): Promise<SavedGame | null> {
	const session = getSession(sessionId);
	if (!session) return null;
	const opts = { name, tags, notes };
	return choice === 'overwrite' && linkedGame(session) ? savedGamesActions.save(sessionId, opts) : savedGamesActions.saveAs(sessionId, opts);
}

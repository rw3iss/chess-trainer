// User-facing saved-game actions with feedback (toasts, downloads). Pure state
// changes live in savedGamesActions; this layer adds the UX around them.
import type { SavedGame } from '@chess/core/game';
import { toast } from '@/services/toast';
import { downloadText, pgnFileName, savedGameToPgn, savedGamesToPgn } from '@/services/pgn';
import { getSavedGame, savedGamesActions } from '@/state/savedGames';
import { openSessions } from '@/state/sessions';

/** Is a session linked to this game currently open? */
export function isGameOpen(id: string): boolean {
	return openSessions.value.some((s) => s.savedGameId === id);
}

/** Focus the linked session if open, else open the game in a new session. */
export function openGame(id: string): boolean {
	return !!savedGamesActions.open(id);
}

/** Delete with an "Undo" toast. */
export async function deleteGameWithUndo(id: string): Promise<void> {
	const g = getSavedGame(id);
	if (!g) return;
	const undo = await savedGamesActions.remove(id);
	toast.show({
		id: `delete-${id}`,
		kind: 'info',
		message: `Deleted “${g.name}”`,
		durationMs: 6000,
		action: {
			label: 'Undo',
			onClick: () => {
				void undo().then(() => toast.success(`Restored “${g.name}”`, { id: `delete-${id}` }));
			},
		},
	});
}

export async function duplicateGame(id: string): Promise<SavedGame | null> {
	const copy = await savedGamesActions.duplicate(id);
	if (copy) toast.success(`Duplicated as “${copy.name}”`, { id: 'duplicate' });
	return copy;
}

export async function renameGame(id: string, name: string): Promise<void> {
	const g = getSavedGame(id);
	const n = name.trim();
	if (!g || !n || n === g.name) return;
	await savedGamesActions.rename(id, n); // also renames linked open sessions
}

export function exportGame(game: SavedGame): void {
	downloadText(pgnFileName(game.name), savedGameToPgn(game) + '\n');
}

export function exportGames(games: readonly SavedGame[]): void {
	if (!games.length) {
		toast.info('No games to export');
		return;
	}
	const date = new Date().toISOString().slice(0, 10);
	downloadText(`chess-games-${date}.pgn`, savedGamesToPgn(games));
	toast.success(`Exported ${games.length} game${games.length === 1 ? '' : 's'}`, { id: 'export' });
}

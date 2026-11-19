// Export everything in the active local database: saved games as PGN, and a JSON backup of
// sessions, saved games, favorites, notes, custom themes and settings.
import { getRepositories } from '@/services/db';
import { downloadText, pgnFileName, savedGamesToPgn } from '@/services/pgn/pgnExport';

export interface AccountBackup {
	app: 'chess-trainer';
	version: 1;
	exportedAt: string;
	account: { username: string; displayName: string } | null;
	sessions: unknown[];
	savedGames: unknown[];
	favorites: unknown[];
	notes: unknown[];
	themes: { board: unknown[]; piece: unknown[] };
	settings: unknown;
}

/** Everything in the active local database (pure read). */
export async function collectBackup(account: AccountBackup['account'], now = new Date()): Promise<AccountBackup> {
	const r = getRepositories();
	const [sessions, savedGames, favorites, notes, board, piece, settings] = await Promise.all([
		r.sessions.list(),
		r.savedGames.list(),
		r.favorites.list(),
		r.notes.list(),
		r.themes.listBoard(),
		r.themes.listPiece(),
		r.settings.get('app'),
	]);
	return { app: 'chess-trainer', version: 1, exportedAt: now.toISOString(), account, sessions, savedGames, favorites, notes, themes: { board, piece }, settings: settings ?? null };
}

const stem = (account: AccountBackup['account']) => `chess-${account?.username ?? 'device'}-${new Date().toISOString().slice(0, 10)}`;

/** Downloads saved games as one PGN file. Returns the number of games. */
export async function exportGamesPgn(account: AccountBackup['account']): Promise<number> {
	const games = await getRepositories().savedGames.list();
	if (games.length) downloadText(pgnFileName(`${stem(account)}-games`), savedGamesToPgn(games));
	return games.length;
}

/** Downloads the JSON backup. */
export async function exportBackupJson(account: AccountBackup['account']): Promise<AccountBackup> {
	const backup = await collectBackup(account);
	downloadText(`${stem(account)}-backup.json`, JSON.stringify(backup, null, '\t'), 'application/json');
	return backup;
}

// Dexie-backed implementations of the repository contracts.
import type { SavedGame, Session } from '@chess/core/game';
import type { BoardTheme, PieceTheme } from '@chess/core/theme';
import type { ChessDb } from '../schema';
import { favoriteId, type FavoriteKind, type FavoriteRecord, type NoteRecord } from '../types';
import type {
	FavoritesRepository,
	KvRepository,
	NotesRepository,
	Repositories,
	SavedGamesRepository,
	SessionsMeta,
	SessionsRepository,
	SettingsRepository,
	ThemesRepository,
} from './types';

const SESSIONS_META_KEY = 'sessions.meta';

/** IndexedDB structured clone rejects Proxies/functions; signals hand us plain objects already, but be safe. */
function plain<T>(value: T): T {
	return typeof structuredClone === 'function' ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);
}

export class DexieSessionsRepository implements SessionsRepository {
	constructor(private db: ChessDb) {}
	list(): Promise<Session[]> {
		return this.db.sessions.toArray();
	}
	get(id: string): Promise<Session | undefined> {
		return this.db.sessions.get(id);
	}
	async put(session: Session): Promise<void> {
		await this.db.sessions.put(plain(session));
	}
	async putMany(sessions: Session[]): Promise<void> {
		await this.db.sessions.bulkPut(sessions.map(plain));
	}
	async remove(id: string): Promise<void> {
		await this.db.sessions.delete(id);
	}
	async getMeta(): Promise<SessionsMeta | undefined> {
		const rec = await this.db.kv.get(SESSIONS_META_KEY);
		return rec?.value as SessionsMeta | undefined;
	}
	async setMeta(meta: SessionsMeta): Promise<void> {
		await this.db.kv.put({ key: SESSIONS_META_KEY, value: plain(meta) });
	}
}

export class DexieSavedGamesRepository implements SavedGamesRepository {
	constructor(private db: ChessDb) {}
	list(): Promise<SavedGame[]> {
		return this.db.savedGames.orderBy('updatedAt').reverse().toArray();
	}
	get(id: string): Promise<SavedGame | undefined> {
		return this.db.savedGames.get(id);
	}
	async put(game: SavedGame): Promise<void> {
		await this.db.savedGames.put(plain(game));
	}
	async remove(id: string): Promise<void> {
		await this.db.savedGames.delete(id);
	}
}

export class DexieFavoritesRepository implements FavoritesRepository {
	constructor(private db: ChessDb) {}
	list(kind?: FavoriteKind): Promise<FavoriteRecord[]> {
		return kind ? this.db.favorites.where('kind').equals(kind).toArray() : this.db.favorites.toArray();
	}
	async has(kind: FavoriteKind, refId: string): Promise<boolean> {
		return (await this.db.favorites.get(favoriteId(kind, refId))) !== undefined;
	}
	async add(kind: FavoriteKind, refId: string): Promise<FavoriteRecord> {
		const rec: FavoriteRecord = { id: favoriteId(kind, refId), kind, refId, createdAt: Date.now() };
		await this.db.favorites.put(rec);
		return rec;
	}
	async remove(kind: FavoriteKind, refId: string): Promise<void> {
		await this.db.favorites.delete(favoriteId(kind, refId));
	}
}

export class DexieThemesRepository implements ThemesRepository {
	constructor(private db: ChessDb) {}
	async listBoard(): Promise<BoardTheme[]> {
		const rows = await this.db.themes.where('kind').equals('board').toArray();
		return rows.map((r) => r.theme as BoardTheme);
	}
	async listPiece(): Promise<PieceTheme[]> {
		const rows = await this.db.themes.where('kind').equals('piece').toArray();
		return rows.map((r) => r.theme as PieceTheme);
	}
	async putBoard(theme: BoardTheme): Promise<void> {
		await this.db.themes.put({ id: theme.id, kind: 'board', theme: plain(theme), updatedAt: Date.now() });
	}
	async putPiece(theme: PieceTheme): Promise<void> {
		await this.db.themes.put({ id: theme.id, kind: 'piece', theme: plain(theme), updatedAt: Date.now() });
	}
	async remove(id: string): Promise<void> {
		await this.db.themes.delete(id);
	}
}

export class DexieNotesRepository implements NotesRepository {
	constructor(private db: ChessDb) {}
	get(epd: string): Promise<NoteRecord | undefined> {
		return this.db.notes.get(epd);
	}
	async set(epd: string, text: string): Promise<void> {
		if (!text.trim()) {
			await this.db.notes.delete(epd);
			return;
		}
		await this.db.notes.put({ epd, text, updatedAt: Date.now() });
	}
	list(): Promise<NoteRecord[]> {
		return this.db.notes.toArray();
	}
}

export class DexieSettingsRepository implements SettingsRepository {
	constructor(private db: ChessDb) {}
	async get<T>(id: string): Promise<T | undefined> {
		return (await this.db.settings.get(id))?.value as T | undefined;
	}
	async set<T>(id: string, value: T): Promise<void> {
		await this.db.settings.put({ id, value: plain(value), updatedAt: Date.now() });
	}
}

export class DexieKvRepository implements KvRepository {
	constructor(private db: ChessDb) {}
	async get<T>(key: string): Promise<T | undefined> {
		return (await this.db.kv.get(key))?.value as T | undefined;
	}
	async set<T>(key: string, value: T): Promise<void> {
		await this.db.kv.put({ key, value: plain(value) });
	}
	async remove(key: string): Promise<void> {
		await this.db.kv.delete(key);
	}
}

export function createDexieRepositories(db: ChessDb): Repositories {
	return {
		sessions: new DexieSessionsRepository(db),
		savedGames: new DexieSavedGamesRepository(db),
		favorites: new DexieFavoritesRepository(db),
		themes: new DexieThemesRepository(db),
		notes: new DexieNotesRepository(db),
		settings: new DexieSettingsRepository(db),
		kv: new DexieKvRepository(db),
	};
}

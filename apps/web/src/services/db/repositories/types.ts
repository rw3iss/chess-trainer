// Repository contracts — the ONLY data path for persisted local data (PLAN §4.5).
// State stores depend on these interfaces, never on Dexie directly, so a
// RemoteRepository (server sync) can wrap them later without UI changes.
import type { SavedGame, Session } from '@chess/core/game';
import type { BoardTheme, PieceTheme } from '@chess/core/theme';
import type { FavoriteKind, FavoriteRecord, NoteRecord } from '../types';

export interface SessionsRepository {
	list(): Promise<Session[]>;
	get(id: string): Promise<Session | undefined>;
	put(session: Session): Promise<void>;
	putMany(sessions: Session[]): Promise<void>;
	remove(id: string): Promise<void>;
	/** Open-tab order + active id (UI meta, stored alongside sessions). */
	getMeta(): Promise<SessionsMeta | undefined>;
	setMeta(meta: SessionsMeta): Promise<void>;
}

export interface SessionsMeta {
	order: string[];
	activeId: string | null;
}

export interface SavedGamesRepository {
	list(): Promise<SavedGame[]>;
	get(id: string): Promise<SavedGame | undefined>;
	put(game: SavedGame): Promise<void>;
	remove(id: string): Promise<void>;
}

export interface FavoritesRepository {
	list(kind?: FavoriteKind): Promise<FavoriteRecord[]>;
	has(kind: FavoriteKind, refId: string): Promise<boolean>;
	add(kind: FavoriteKind, refId: string): Promise<FavoriteRecord>;
	remove(kind: FavoriteKind, refId: string): Promise<void>;
}

export interface ThemesRepository {
	listBoard(): Promise<BoardTheme[]>;
	listPiece(): Promise<PieceTheme[]>;
	putBoard(theme: BoardTheme): Promise<void>;
	putPiece(theme: PieceTheme): Promise<void>;
	remove(id: string): Promise<void>;
}

export interface NotesRepository {
	get(epd: string): Promise<NoteRecord | undefined>;
	/** Empty / whitespace text removes the note. */
	set(epd: string, text: string): Promise<void>;
	list(): Promise<NoteRecord[]>;
}

export interface SettingsRepository {
	get<T>(id: string): Promise<T | undefined>;
	set<T>(id: string, value: T): Promise<void>;
}

export interface KvRepository {
	get<T>(key: string): Promise<T | undefined>;
	set<T>(key: string, value: T): Promise<void>;
	remove(key: string): Promise<void>;
}

export interface Repositories {
	sessions: SessionsRepository;
	savedGames: SavedGamesRepository;
	favorites: FavoritesRepository;
	themes: ThemesRepository;
	notes: NotesRepository;
	settings: SettingsRepository;
	kv: KvRepository;
}

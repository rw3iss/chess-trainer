// Local (IndexedDB) record shapes that are web-only. Domain types (Session,
// SavedGame, BoardTheme, PieceTheme) come from @chess/core.
import type { BoardTheme, PieceTheme } from '@chess/core/theme';

export type FavoriteKind = 'opening' | 'game';

export interface FavoriteRecord {
	/** `${kind}:${refId}` */
	id: string;
	kind: FavoriteKind;
	/** Opening id (stable hash of its UCI line) or saved-game id. */
	refId: string;
	createdAt: number;
}

export type ThemeRecord =
	| { id: string; kind: 'board'; theme: BoardTheme; updatedAt: number }
	| { id: string; kind: 'piece'; theme: PieceTheme; updatedAt: number };

/** A user's note on a position, keyed by EPD (first 4 FEN fields). */
export interface NoteRecord {
	epd: string;
	text: string;
	updatedAt: number;
}

export interface SettingsRecord<T = unknown> {
	id: string;
	value: T;
	updatedAt: number;
}

export interface KvRecord<T = unknown> {
	key: string;
	value: T;
}

export function favoriteId(kind: FavoriteKind, refId: string): string {
	return `${kind}:${refId}`;
}

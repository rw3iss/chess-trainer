// Dexie schema. Bump the version + add an upgrade() when changing indexes.
import Dexie, { type EntityTable } from 'dexie';
import type { SavedGame, Session } from '@chess/core/game';
import type { FavoriteRecord, KvRecord, NoteRecord, SettingsRecord, ThemeRecord } from './types';

export const DB_NAME = 'chess-openings';

export class ChessDb extends Dexie {
	sessions!: EntityTable<Session, 'id'>;
	savedGames!: EntityTable<SavedGame, 'id'>;
	favorites!: EntityTable<FavoriteRecord, 'id'>;
	themes!: EntityTable<ThemeRecord, 'id'>;
	notes!: EntityTable<NoteRecord, 'epd'>;
	settings!: EntityTable<SettingsRecord, 'id'>;
	kv!: EntityTable<KvRecord, 'key'>;

	constructor(name = DB_NAME) {
		super(name);
		this.version(1).stores({
			sessions: 'id, updatedAt',
			savedGames: 'id, name, updatedAt, createdAt, favorite, *tags, mode',
			favorites: 'id, kind, refId, createdAt',
			themes: 'id, kind, updatedAt',
			notes: 'epd, updatedAt',
			settings: 'id',
			kv: 'key',
		});
	}
}

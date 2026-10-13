import { Column, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers';

/**
 * Shared shape of every client-synced document table. The client object
 * (SavedGame / Session) is stored whole as JSON in `data`; the columns beside
 * it are only what the server needs for ownership, LWW and delta sync.
 * Primary key is (user_id, id) — ids are client-generated, scoped per user.
 */
export abstract class SyncedRow<T> {
	@PrimaryColumn({ name: 'user_id', type: 'varchar', length: 64 })
	userId!: string;

	@PrimaryColumn({ type: 'varchar', length: 64 })
	id!: string;

	/** Full client document. Null for tombstones. */
	@Column({ type: 'simple-json', nullable: true })
	data!: T | null;

	@Column({ type: 'integer', default: 0 })
	revision!: number;

	/** Client `updatedAt` (epoch ms) — LWW tie-breaker. */
	@Column({ name: 'updated_at', type: 'bigint', transformer: bigintNumber })
	updatedAt!: number;

	/** Tombstone: kept so other devices learn about the delete on their next sync. */
	@Column({ type: 'boolean', default: false })
	deleted!: boolean;

	/** Server clock when this row last changed — drives `since` delta queries. */
	@Column({ name: 'server_updated_at', type: 'bigint', transformer: bigintNumber })
	serverUpdatedAt!: number;
}

import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers';

@Entity('users')
export class UserEntity {
	@PrimaryColumn({ type: 'varchar', length: 64 })
	id!: string;

	@Column({ type: 'varchar', length: 64, unique: true })
	username!: string;

	@Column({ name: 'display_name', type: 'varchar', length: 64 })
	displayName!: string;

	@Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
	passwordHash!: string | null;

	@Column({ type: 'varchar', length: 16 })
	role!: 'owner' | 'user';

	/** Free-form client preferences (synced settings). */
	@Column({ type: 'simple-json', nullable: true })
	preferences!: Record<string, unknown> | null;

	@Column({ name: 'created_at', type: 'bigint', transformer: bigintNumber })
	createdAt!: number;

	@Column({ name: 'updated_at', type: 'bigint', transformer: bigintNumber })
	updatedAt!: number;
}

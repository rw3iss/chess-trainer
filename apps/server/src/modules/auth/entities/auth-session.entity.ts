import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers';

/**
 * One signed-in device. Refresh tokens carry (sid, rot); each refresh bumps `rotation`. A refresh token
 * with an old rotation = reuse of a stolen token → the session is revoked.
 */
@Entity('auth_sessions')
export class AuthSessionEntity {
	@PrimaryColumn({ type: 'varchar', length: 64 })
	id!: string;

	@Index('idx_auth_sessions_user')
	@Column({ name: 'user_id', type: 'varchar', length: 64 })
	userId!: string;

	@Column({ type: 'integer', default: 0 })
	rotation!: number;

	@Column({ type: 'varchar', length: 128 })
	label!: string;

	@Column({ name: 'created_at', type: 'bigint', transformer: bigintNumber })
	createdAt!: number;

	@Column({ name: 'last_used_at', type: 'bigint', transformer: bigintNumber })
	lastUsedAt!: number;

	@Column({ name: 'revoked_at', type: 'bigint', nullable: true, transformer: bigintNumber })
	revokedAt!: number | null;
}

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers';

/** One password reset link. Only the SHA-256 of the token is stored; the token itself is only in the email. */
@Entity('password_resets')
export class PasswordResetEntity {
	@PrimaryColumn({ type: 'varchar', length: 64 })
	id!: string;

	@Index('idx_password_resets_user')
	@Column({ name: 'user_id', type: 'varchar', length: 64 })
	userId!: string;

	@Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
	tokenHash!: string;

	@Column({ name: 'expires_at', type: 'bigint', transformer: bigintNumber })
	expiresAt!: number;

	@Column({ name: 'used_at', type: 'bigint', nullable: true, transformer: bigintNumber })
	usedAt!: number | null;

	@Column({ name: 'created_at', type: 'bigint', transformer: bigintNumber })
	createdAt!: number;
}

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers';

/** A pending email confirmation. Only the SHA-256 of the link token is stored. */
@Entity('email_verifications')
export class EmailVerificationEntity {
	@PrimaryColumn({ type: 'varchar', length: 64 })
	id!: string;

	@Index('idx_email_verifications_user')
	@Column({ name: 'user_id', type: 'varchar', length: 64 })
	userId!: string;

	/** The address being confirmed (the user may change it again before clicking). */
	@Column({ type: 'varchar', length: 254 })
	email!: string;

	@Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
	tokenHash!: string;

	@Column({ name: 'expires_at', type: 'bigint', transformer: bigintNumber })
	expiresAt!: number;

	@Column({ name: 'used_at', type: 'bigint', nullable: true, transformer: bigintNumber })
	usedAt!: number | null;

	@Column({ name: 'created_at', type: 'bigint', transformer: bigintNumber })
	createdAt!: number;
}

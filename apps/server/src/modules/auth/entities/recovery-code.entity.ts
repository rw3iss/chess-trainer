import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers';

/** One-time password recovery code (argon2 hash). */
@Entity('recovery_codes')
export class RecoveryCodeEntity {
	@PrimaryColumn({ type: 'varchar', length: 64 })
	id!: string;

	@Index('idx_recovery_codes_user')
	@Column({ name: 'user_id', type: 'varchar', length: 64 })
	userId!: string;

	@Column({ name: 'code_hash', type: 'varchar', length: 255 })
	codeHash!: string;

	@Column({ name: 'used_at', type: 'bigint', nullable: true, transformer: bigintNumber })
	usedAt!: number | null;

	@Column({ name: 'created_at', type: 'bigint', transformer: bigintNumber })
	createdAt!: number;
}

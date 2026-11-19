import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers';

/** An invite a user emailed to a friend. The code is in the sign-up link (/signup?invite=…). */
@Entity('invites')
export class InviteEntity {
	@PrimaryColumn({ type: 'varchar', length: 64 })
	code!: string;

	@Index('idx_invites_inviter')
	@Column({ name: 'inviter_id', type: 'varchar', length: 64 })
	inviterId!: string;

	@Column({ type: 'varchar', length: 254 })
	email!: string;

	@Column({ name: 'created_at', type: 'bigint', transformer: bigintNumber })
	createdAt!: number;

	@Column({ name: 'accepted_at', type: 'bigint', nullable: true, transformer: bigintNumber })
	acceptedAt!: number | null;

	@Column({ name: 'accepted_by', type: 'varchar', length: 64, nullable: true })
	acceptedBy!: string | null;
}

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { OAuthProviderId } from '@chess/core';
import { bigintNumber } from '../../../database/transformers';

/** A sign-in provider account linked to a user (Google, Lichess, …). One provider account → one user. */
@Entity('user_identities')
export class UserIdentityEntity {
	@PrimaryColumn({ type: 'varchar', length: 32 })
	provider!: OAuthProviderId;

	/** The provider's stable user id (Google `sub`, Lichess id). */
	@PrimaryColumn({ type: 'varchar', length: 255 })
	subject!: string;

	@Index('idx_user_identities_user')
	@Column({ name: 'user_id', type: 'varchar', length: 64 })
	userId!: string;

	/** Shown in the app (provider email or username). */
	@Column({ type: 'varchar', length: 255 })
	label!: string;

	@Column({ name: 'linked_at', type: 'bigint', transformer: bigintNumber })
	linkedAt!: number;
}

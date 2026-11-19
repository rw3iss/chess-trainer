import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
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

	/** Lower-cased; for password reset links. Unique when set. */
	@Index('uq_users_email', { unique: true })
	@Column({ type: 'varchar', length: 254, nullable: true })
	email!: string | null;

	/** The email is confirmed (verify link, or a provider vouched for it). Reset links go only to verified emails. */
	@Column({ name: 'email_verified', type: 'boolean', default: false })
	emailVerified!: boolean;

	/** 'png' | 'jpeg' | 'webp' when an avatar is stored (AvatarStore), else null. */
	@Column({ name: 'avatar_type', type: 'varchar', length: 16, nullable: true })
	avatarType!: string | null;

	/** Bumped on every avatar change (cache-busting ?v=). */
	@Column({ name: 'avatar_version', type: 'integer', default: 0 })
	avatarVersion!: number;

	/** Epoch seconds. Refresh tokens issued before this are refused (set on password change / reset). */
	@Column({ name: 'tokens_valid_after', type: 'bigint', default: 0, transformer: bigintNumber })
	tokensValidAfter!: number;

	/** Free-form client preferences (synced settings). */
	@Column({ type: 'simple-json', nullable: true })
	preferences!: Record<string, unknown> | null;

	@Column({ name: 'created_at', type: 'bigint', transformer: bigintNumber })
	createdAt!: number;

	@Column({ name: 'updated_at', type: 'bigint', transformer: bigintNumber })
	updatedAt!: number;
}

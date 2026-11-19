import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/**
 * users.email_verified / avatar_type / avatar_version; email_verifications; auth_sessions (devices,
 * rotating refresh tokens); recovery_codes. Existing emails were set by their signed-in owners → verified.
 */
export class ProfileSecurity1763700000000 implements MigrationInterface {
	name = 'ProfileSecurity1763700000000';

	async up(q: QueryRunner): Promise<void> {
		await q.addColumns('users', [
			new TableColumn({ name: 'email_verified', type: 'boolean', default: false }),
			new TableColumn({ name: 'avatar_type', type: 'varchar', length: '16', isNullable: true }),
			new TableColumn({ name: 'avatar_version', type: 'integer', default: 0 }),
		]);
		await q.query('UPDATE users SET email_verified = true WHERE email IS NOT NULL');
		await q.createTable(
			new Table({
				name: 'email_verifications',
				columns: [
					{ name: 'id', type: 'varchar', length: '64', isPrimary: true },
					{ name: 'user_id', type: 'varchar', length: '64' },
					{ name: 'email', type: 'varchar', length: '254' },
					{ name: 'token_hash', type: 'varchar', length: '64', isUnique: true },
					{ name: 'expires_at', type: 'bigint' },
					{ name: 'used_at', type: 'bigint', isNullable: true },
					{ name: 'created_at', type: 'bigint' },
				],
			}),
			true,
		);
		await q.createIndex('email_verifications', new TableIndex({ name: 'idx_email_verifications_user', columnNames: ['user_id'] }));
		await q.createTable(
			new Table({
				name: 'auth_sessions',
				columns: [
					{ name: 'id', type: 'varchar', length: '64', isPrimary: true },
					{ name: 'user_id', type: 'varchar', length: '64' },
					{ name: 'rotation', type: 'integer', default: 0 },
					{ name: 'label', type: 'varchar', length: '128' },
					{ name: 'created_at', type: 'bigint' },
					{ name: 'last_used_at', type: 'bigint' },
					{ name: 'revoked_at', type: 'bigint', isNullable: true },
				],
			}),
			true,
		);
		await q.createIndex('auth_sessions', new TableIndex({ name: 'idx_auth_sessions_user', columnNames: ['user_id'] }));
		await q.createTable(
			new Table({
				name: 'recovery_codes',
				columns: [
					{ name: 'id', type: 'varchar', length: '64', isPrimary: true },
					{ name: 'user_id', type: 'varchar', length: '64' },
					{ name: 'code_hash', type: 'varchar', length: '255' },
					{ name: 'used_at', type: 'bigint', isNullable: true },
					{ name: 'created_at', type: 'bigint' },
				],
			}),
			true,
		);
		await q.createIndex('recovery_codes', new TableIndex({ name: 'idx_recovery_codes_user', columnNames: ['user_id'] }));
	}

	async down(q: QueryRunner): Promise<void> {
		await q.dropTable('recovery_codes', true);
		await q.dropTable('auth_sessions', true);
		await q.dropTable('email_verifications', true);
		await q.dropColumn('users', 'avatar_version');
		await q.dropColumn('users', 'avatar_type');
		await q.dropColumn('users', 'email_verified');
	}
}

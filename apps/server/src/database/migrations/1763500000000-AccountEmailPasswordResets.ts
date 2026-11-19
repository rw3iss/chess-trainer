import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/** users.email + users.tokens_valid_after; password_resets (hashed single-use reset tokens). */
export class AccountEmailPasswordResets1763500000000 implements MigrationInterface {
	name = 'AccountEmailPasswordResets1763500000000';

	async up(q: QueryRunner): Promise<void> {
		await q.addColumns('users', [
			new TableColumn({ name: 'email', type: 'varchar', length: '254', isNullable: true }),
			new TableColumn({ name: 'tokens_valid_after', type: 'bigint', default: 0 }),
		]);
		await q.createIndex('users', new TableIndex({ name: 'uq_users_email', columnNames: ['email'], isUnique: true }));
		await q.createTable(
			new Table({
				name: 'password_resets',
				columns: [
					{ name: 'id', type: 'varchar', length: '64', isPrimary: true },
					{ name: 'user_id', type: 'varchar', length: '64' },
					{ name: 'token_hash', type: 'varchar', length: '64', isUnique: true },
					{ name: 'expires_at', type: 'bigint' },
					{ name: 'used_at', type: 'bigint', isNullable: true },
					{ name: 'created_at', type: 'bigint' },
				],
			}),
			true,
		);
		await q.createIndex('password_resets', new TableIndex({ name: 'idx_password_resets_user', columnNames: ['user_id'] }));
	}

	async down(q: QueryRunner): Promise<void> {
		await q.dropTable('password_resets', true);
		await q.dropIndex('users', 'uq_users_email');
		await q.dropColumn('users', 'tokens_valid_after');
		await q.dropColumn('users', 'email');
	}
}

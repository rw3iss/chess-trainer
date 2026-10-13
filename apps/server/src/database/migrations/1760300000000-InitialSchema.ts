import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Initial schema: users, saved_games, sessions.
 * Written with TypeORM's Table API (not raw SQL) so it runs unchanged on
 * SQLite and Postgres.
 */
export class InitialSchema1760300000000 implements MigrationInterface {
	name = 'InitialSchema1760300000000';

	async up(q: QueryRunner): Promise<void> {
		await q.createTable(
			new Table({
				name: 'users',
				columns: [
					{ name: 'id', type: 'varchar', length: '64', isPrimary: true },
					{ name: 'username', type: 'varchar', length: '64', isUnique: true },
					{ name: 'display_name', type: 'varchar', length: '64' },
					{ name: 'password_hash', type: 'varchar', length: '255', isNullable: true },
					{ name: 'role', type: 'varchar', length: '16' },
					{ name: 'preferences', type: 'text', isNullable: true },
					{ name: 'created_at', type: 'bigint' },
					{ name: 'updated_at', type: 'bigint' },
				],
			}),
			true,
		);
		for (const name of ['saved_games', 'sessions']) {
			// oxlint-disable-next-line no-await-in-loop -- DDL runs in order
			await q.createTable(
				new Table({
					name,
					columns: [
						{ name: 'user_id', type: 'varchar', length: '64', isPrimary: true },
						{ name: 'id', type: 'varchar', length: '64', isPrimary: true },
						{ name: 'data', type: 'text', isNullable: true },
						{ name: 'revision', type: 'integer', default: 0 },
						{ name: 'updated_at', type: 'bigint' },
						{ name: 'deleted', type: 'boolean', default: false },
						{ name: 'server_updated_at', type: 'bigint' },
					],
				}),
				true,
			);
			// oxlint-disable-next-line no-await-in-loop -- DDL runs in order
			await q.createIndex(
				name,
				new TableIndex({ name: `idx_${name}_user_server_updated`, columnNames: ['user_id', 'server_updated_at'] }),
			);
		}
	}

	async down(q: QueryRunner): Promise<void> {
		await q.dropTable('sessions', true);
		await q.dropTable('saved_games', true);
		await q.dropTable('users', true);
	}
}

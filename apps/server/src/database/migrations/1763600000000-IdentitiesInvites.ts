import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** user_identities (linked sign-in providers) and invites (friend sign-up links). */
export class IdentitiesInvites1763600000000 implements MigrationInterface {
	name = 'IdentitiesInvites1763600000000';

	async up(q: QueryRunner): Promise<void> {
		await q.createTable(
			new Table({
				name: 'user_identities',
				columns: [
					{ name: 'provider', type: 'varchar', length: '32', isPrimary: true },
					{ name: 'subject', type: 'varchar', length: '255', isPrimary: true },
					{ name: 'user_id', type: 'varchar', length: '64' },
					{ name: 'label', type: 'varchar', length: '255' },
					{ name: 'linked_at', type: 'bigint' },
				],
			}),
			true,
		);
		await q.createIndex('user_identities', new TableIndex({ name: 'idx_user_identities_user', columnNames: ['user_id'] }));
		await q.createTable(
			new Table({
				name: 'invites',
				columns: [
					{ name: 'code', type: 'varchar', length: '64', isPrimary: true },
					{ name: 'inviter_id', type: 'varchar', length: '64' },
					{ name: 'email', type: 'varchar', length: '254' },
					{ name: 'created_at', type: 'bigint' },
					{ name: 'accepted_at', type: 'bigint', isNullable: true },
					{ name: 'accepted_by', type: 'varchar', length: '64', isNullable: true },
				],
			}),
			true,
		);
		await q.createIndex('invites', new TableIndex({ name: 'idx_invites_inviter', columnNames: ['inviter_id'] }));
	}

	async down(q: QueryRunner): Promise<void> {
		await q.dropTable('invites', true);
		await q.dropTable('user_identities', true);
	}
}

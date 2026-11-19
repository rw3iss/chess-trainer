import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AvatarStore } from '../users/avatar/avatar-store';
import { UsersService } from '../users/users.service';

/** Tables with a `user_id` column that belong to one account (deleted with it). */
const USER_TABLES = ['saved_games', 'sessions', 'user_identities', 'password_resets', 'email_verifications', 'auth_sessions', 'recovery_codes'];

/** Account deletion: every row and file of the user. */
@Injectable()
export class AccountService {
	private readonly logger = new Logger(AccountService.name);

	constructor(
		@InjectDataSource() private readonly ds: DataSource,
		private readonly users: UsersService,
		private readonly avatars: AvatarStore,
	) {}

	async delete(userId: string, password: string): Promise<void> {
		const user = await this.users.findById(userId);
		if (user.role === 'owner') throw new ForbiddenException('the owner account cannot be deleted');
		if (user.passwordHash && !(await this.users.verifyPassword(user, password))) throw new UnauthorizedException('the password is wrong');
		await this.ds.transaction(async (m) => {
			for (const table of USER_TABLES) {
				// oxlint-disable-next-line no-await-in-loop -- one transaction, in order
				await m.createQueryBuilder().delete().from(table).where('user_id = :id', { id: userId }).execute();
			}
			await m.createQueryBuilder().delete().from('invites').where('inviter_id = :id', { id: userId }).execute();
			await m.createQueryBuilder().delete().from('users').where('id = :id', { id: userId }).execute();
		});
		await this.avatars.remove(userId).catch(() => undefined);
		this.logger.log(`account ${user.username} deleted`);
	}
}

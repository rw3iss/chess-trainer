import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SignupMode } from '@chess/core';
import { RateLimiter } from '../../cache/rate-limiter';
import { InvitesService } from '../invites/invites.service';
import type { InviteEntity } from '../invites/entities/invite.entity';
import { UsersService } from '../users/users.service';
import type { UserEntity } from '../users/entities/user.entity';

/** Sign-up policy (SIGNUP_MODE) + account creation, shared by password sign-up and provider sign-in. */
@Injectable()
export class RegistrationService {
	constructor(
		private readonly users: UsersService,
		private readonly invites: InvitesService,
		private readonly limits: RateLimiter,
		private readonly config: ConfigService,
	) {}

	get mode(): SignupMode {
		return this.config.get<SignupMode>('auth.signupMode') ?? 'open';
	}

	/**
	 * Checks the policy and the per-IP limit. Returns the invite to accept after creation (null = none).
	 * 'off' → 403; 'invite' → a valid unused code is required; 'open' → a bad code is ignored.
	 */
	async admit(invite: string | undefined, ip: string | undefined): Promise<InviteEntity | null> {
		if (this.mode === 'off') throw new ForbiddenException('sign-up is closed on this server');
		const found = invite ? await this.invites.usable(invite).catch(() => null) : null;
		if (this.mode === 'invite' && !found) throw new ForbiddenException('sign-up needs a valid invite');
		await this.limits.hit(`register:ip:${ip ?? 'unknown'}`, this.config.get<number>('auth.registerMaxPerIp') ?? 5, 3600, 'too many new accounts from this network — try again later');
		return found;
	}

	async create(input: Parameters<UsersService['createUser']>[0], invite: InviteEntity | null): Promise<UserEntity> {
		const user = await this.users.createUser(input);
		if (invite) await this.invites.accept(invite.code, user.id);
		return user;
	}
}

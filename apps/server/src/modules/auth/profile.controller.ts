import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { DeviceSessionDto, OwnerResetLinkDto, RecoveryCodesResponse } from '@chess/core';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { AccountService } from './account.service';
import { PasswordConfirmDto, RecoveryCodesDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { RecoveryService } from './recovery.service';
import { SessionsService } from './sessions.service';

/** Account security endpoints under /users/me (devices, recovery codes, delete) + owner tools under /admin. */
@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class ProfileController {
	constructor(
		private readonly sessions: SessionsService,
		private readonly recovery: RecoveryService,
		private readonly accounts: AccountService,
		private readonly passwords: PasswordService,
		private readonly users: UsersService,
	) {}

	@Get('users/me/sessions')
	devices(@CurrentUser() user: AuthUser): Promise<DeviceSessionDto[]> {
		return this.sessions.list(user.id, user.sid);
	}

	/** Sign a device out (its refresh token stops working; its access token expires within 15 min). */
	@Delete('users/me/sessions/:id')
	@HttpCode(204)
	signOutDevice(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
		return this.sessions.revoke(user.id, id);
	}

	@Get('users/me/recovery-codes')
	async remaining(@CurrentUser() user: AuthUser): Promise<{ remaining: number }> {
		return { remaining: await this.recovery.remaining(user.id) };
	}

	/** 8 new codes (shown once); the old ones stop working. */
	@Post('users/me/recovery-codes')
	async newCodes(@CurrentUser() user: AuthUser, @Body() body: RecoveryCodesDto): Promise<RecoveryCodesResponse> {
		return { codes: await this.recovery.generate(user.id, body.currentPassword) };
	}

	/** Delete the account and all its data (password required when it has one). */
	@Delete('users/me')
	@HttpCode(204)
	deleteMe(@CurrentUser() user: AuthUser, @Body() body: PasswordConfirmDto): Promise<void> {
		return this.accounts.delete(user.id, body.password);
	}

	/** Owner tool: a one-time password reset link for a user (pass it on by any channel). */
	@Post('admin/users/:username/reset-link')
	async resetLink(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<OwnerResetLinkDto> {
		if (user.role !== 'owner') throw new ForbiddenException('owner only');
		const target = await this.users.findByUsername(username);
		if (!target) throw new NotFoundException('no such user');
		return this.passwords.createLink(target);
	}
}

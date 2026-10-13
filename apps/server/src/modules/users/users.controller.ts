import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { UserDto } from '@chess/core';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth/auth-user';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
	constructor(private readonly users: UsersService) {}

	/** Current user's profile + synced preferences. */
	@Get('me')
	async me(@CurrentUser() user: AuthUser): Promise<UserDto & { preferences: Record<string, unknown> | null }> {
		const u = await this.users.findById(user.id);
		return { ...this.users.toDto(u), preferences: u.preferences };
	}

	/** Update display name and/or replace the preferences blob. */
	@Patch('me')
	async update(
		@CurrentUser() user: AuthUser,
		@Body() body: UpdateMeDto,
	): Promise<UserDto & { preferences: Record<string, unknown> | null }> {
		const u = await this.users.update(user.id, body);
		return { ...this.users.toDto(u), preferences: u.preferences };
	}
}

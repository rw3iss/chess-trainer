import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { UserDto } from '@chess/core';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../../common/auth/auth-user';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';
import { AVATAR_MAX_BYTES } from './avatar/avatar-store';

type Me = UserDto & { preferences: Record<string, unknown> | null };

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
	constructor(private readonly users: UsersService) {}

	/** Current user's profile + synced preferences. */
	@Get('me')
	async me(@CurrentUser() user: AuthUser): Promise<Me> {
		const u = await this.users.findById(user.id);
		return { ...this.users.toDto(u), preferences: u.preferences };
	}

	/** Update display name, email (sends a confirmation link) and/or the preferences blob. */
	@Patch('me')
	async update(@CurrentUser() user: AuthUser, @Body() body: UpdateMeDto): Promise<Me> {
		const u = await this.users.update(user.id, body);
		return { ...this.users.toDto(u), preferences: u.preferences };
	}

	/** Send the email confirmation link again (3/h). */
	@Post('me/email/verify')
	@HttpCode(202)
	async resendVerification(@CurrentUser() user: AuthUser): Promise<{ sent: true }> {
		await this.users.resendVerification(user.id);
		return { sent: true };
	}

	/** Upload an avatar: multipart field `file`, PNG/JPEG/WebP ≤ 300 KB. */
	@Put('me/avatar')
	@ApiConsumes('multipart/form-data')
	@UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
	async putAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: { buffer: Buffer } | undefined): Promise<UserDto> {
		if (!file?.buffer) throw new NotFoundException('no file');
		return this.users.toDto(await this.users.setAvatar(user.id, file.buffer));
	}

	@Delete('me/avatar')
	async deleteAvatar(@CurrentUser() user: AuthUser): Promise<UserDto> {
		return this.users.toDto(await this.users.removeAvatar(user.id));
	}

	/** Public avatar image (immutable per ?v=). */
	@Public()
	@Get(':id/avatar')
	async avatar(@Param('id') id: string, @Res() res: Response): Promise<void> {
		const a = /^[A-Za-z0-9-]{1,64}$/.test(id) ? await this.users.avatar(id) : null;
		if (!a) {
			res.status(404).end();
			return;
		}
		res.setHeader('Content-Type', `image/${a.type}`);
		res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.send(a.bytes);
	}
}

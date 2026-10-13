import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthTokens, UserDto } from '@chess/core';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowGuest, Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { GuestDto, GuestTokenResponse, LoginDto, RefreshDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
	constructor(private readonly auth: AuthService) {}

	/** Username/password login → access + refresh tokens. */
	@Public()
	@Post('login')
	@HttpCode(200)
	login(@Body() body: LoginDto): Promise<AuthTokens> {
		return this.auth.login(body.username, body.password);
	}

	/** Refresh token → new access + refresh pair. */
	@Public()
	@Post('refresh')
	@HttpCode(200)
	refresh(@Body() body: RefreshDto): Promise<AuthTokens> {
		return this.auth.refresh(body.refreshToken);
	}

	/** Guest token (display name only) for joining rooms. */
	@Public()
	@Post('guest')
	@HttpCode(200)
	guest(@Body() body: GuestDto): Promise<GuestTokenResponse> {
		return this.auth.guest(body.displayName);
	}

	/** The principal behind the current token (owner, user or guest). */
	@AllowGuest()
	@ApiBearerAuth()
	@Get('me')
	me(@CurrentUser() user: AuthUser): UserDto {
		return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
	}
}

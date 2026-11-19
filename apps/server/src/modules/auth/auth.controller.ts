import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthTokens, UserDto } from '@chess/core';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowGuest, Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordDto, ForgotPasswordDto, GuestDto, GuestTokenResponse, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';
import { RegistrationService } from './registration.service';
import { PasswordService } from './password.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
	constructor(
		private readonly auth: AuthService,
		private readonly passwords: PasswordService,
		private readonly registration: RegistrationService,
	) {}

	/** Create an account (SIGNUP_MODE open / invite) → signed in. 403 closed or no invite; 409 taken; 429. */
	@Public()
	@Post('register')
	@HttpCode(201)
	async register(@Body() body: RegisterDto, @Ip() ip: string): Promise<AuthTokens> {
		const invite = await this.registration.admit(body.invite, ip);
		const user = await this.registration.create({ username: body.username, password: body.password, displayName: body.displayName, email: body.email }, invite);
		return this.auth.tokensFor(user);
	}

	/** Email a reset link for a username or email. Always 202 (no account enumeration); 429 rate limited; 503 no email. */
	@Public()
	@Post('password/forgot')
	@HttpCode(202)
	async forgot(@Body() body: ForgotPasswordDto, @Ip() ip: string): Promise<{ sent: true }> {
		await this.passwords.requestReset(body.identifier, ip);
		return { sent: true };
	}

	/** Reset link token + new password → signed in (other sessions signed out). */
	@Public()
	@Post('password/reset')
	@HttpCode(200)
	async reset(@Body() body: ResetPasswordDto): Promise<AuthTokens> {
		return this.auth.tokensFor(await this.passwords.reset(body.token, body.password));
	}

	/** Change password (current password required) → fresh tokens (other sessions signed out). */
	@ApiBearerAuth()
	@Post('password/change')
	@HttpCode(200)
	async change(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto): Promise<AuthTokens> {
		return this.auth.tokensFor(await this.passwords.change(user.id, body.currentPassword, body.newPassword));
	}

	/** Username/password login → access + refresh tokens. */
	@Public()
	@Post('login')
	@HttpCode(200)
	login(@Body() body: LoginDto, @Ip() ip: string): Promise<AuthTokens> {
		return this.auth.login(body.username, body.password, ip);
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

import { Body, Controller, Get, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthTokens, UserDto } from '@chess/core';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowGuest, Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordDto, ForgotPasswordDto, GuestDto, GuestTokenResponse, LoginDto, RecoverPasswordDto, RefreshDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';
import { RecoveryService } from './recovery.service';
import { RegistrationService } from './registration.service';
import { PasswordService } from './password.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
	constructor(
		private readonly auth: AuthService,
		private readonly passwords: PasswordService,
		private readonly registration: RegistrationService,
		private readonly recovery: RecoveryService,
	) {}

	/** Recovery code + new password → signed in (every other session ends). */
	@Public()
	@Post('password/recover')
	@HttpCode(200)
	async recover(@Body() body: RecoverPasswordDto, @Ip() ip: string, @Headers('user-agent') ua?: string): Promise<AuthTokens> {
		return this.auth.tokensFor(await this.recovery.recover(body.username, body.code, body.password, ip), { userAgent: ua });
	}

	/** Sign out: ends the session of this refresh token (always 204). */
	@Public()
	@Post('logout')
	@HttpCode(204)
	async logout(@Body() body: RefreshDto): Promise<void> {
		await this.auth.logout(body.refreshToken);
	}

	/** Create an account (SIGNUP_MODE open / invite) → signed in. 403 closed or no invite; 409 taken; 429. */
	@Public()
	@Post('register')
	@HttpCode(201)
	async register(@Body() body: RegisterDto, @Ip() ip: string, @Headers('user-agent') ua?: string): Promise<AuthTokens> {
		const invite = await this.registration.admit(body.invite, ip);
		const user = await this.registration.create({ username: body.username, password: body.password, displayName: body.displayName, email: body.email }, invite);
		return this.auth.tokensFor(user, { userAgent: ua });
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
	async reset(@Body() body: ResetPasswordDto, @Headers('user-agent') ua?: string): Promise<AuthTokens> {
		return this.auth.tokensFor(await this.passwords.reset(body.token, body.password), { userAgent: ua });
	}

	/** Change password (current password required) → fresh tokens (other sessions signed out). */
	@ApiBearerAuth()
	@Post('password/change')
	@HttpCode(200)
	async change(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto): Promise<AuthTokens> {
		const u = await this.passwords.change(user.id, body.currentPassword, body.newPassword, user.sid);
		return this.auth.tokensFor(u, { sessionId: user.sid });
	}

	/** Username/password login → access + refresh tokens. */
	@Public()
	@Post('login')
	@HttpCode(200)
	login(@Body() body: LoginDto, @Ip() ip: string, @Headers('user-agent') ua?: string): Promise<AuthTokens> {
		return this.auth.login(body.username, body.password, ip, ua);
	}

	/** Refresh token → new access + refresh pair. */
	@Public()
	@Post('refresh')
	@HttpCode(200)
	refresh(@Body() body: RefreshDto, @Headers('user-agent') ua?: string): Promise<AuthTokens> {
		return this.auth.refresh(body.refreshToken, ua);
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

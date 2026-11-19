import { Body, Controller, Delete, Get, Headers, HttpCode, Ip, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { IdentityDto, OAuthExchangeResponse } from '@chess/core';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthService } from '../auth.service';
import { OAuthExchangeDto, OAuthStartDto } from './oauth.dto';
import { OAuthService } from './oauth.service';

@ApiTags('auth')
@Controller()
export class OAuthController {
	constructor(
		private readonly oauth: OAuthService,
		private readonly auth: AuthService,
	) {}

	/** Begin provider sign-in → { url }. 'link' mode needs the bearer token of the account to link. */
	@Public()
	@Post('auth/oauth/:provider/start')
	@HttpCode(200)
	async start(
		@Param('provider') provider: string,
		@Body() body: OAuthStartDto,
		@Headers('authorization') authz: string | undefined,
		@Headers('user-agent') ua: string | undefined,
		@Ip() ip: string,
	): Promise<{ url: string }> {
		const token = authz?.startsWith('Bearer ') ? authz.slice(7).trim() : undefined;
		const userId = token && body.mode === 'link' ? (await this.auth.verify(token, 'access')).sub : null;
		return this.oauth.start(provider, body, userId, ip, ua);
	}

	/** Provider redirect target (register `<api base>/auth/<provider>/callback` with the provider). */
	@Public()
	@Get('auth/:provider/callback')
	async callback(
		@Param('provider') provider: string,
		@Query('code') code: string | undefined,
		@Query('state') state: string | undefined,
		@Query('error') error: string | undefined,
		@Res() res: Response,
	): Promise<void> {
		try {
			res.redirect(302, await this.oauth.callback(provider, { code, state, error }));
		} catch (e) {
			res.status(400).type('text/plain').send(e instanceof Error ? e.message : 'sign-in failed');
		}
	}

	/** Single-use code from the callback → tokens. */
	@Public()
	@Post('auth/oauth/exchange')
	@HttpCode(200)
	exchange(@Body() body: OAuthExchangeDto): Promise<OAuthExchangeResponse> {
		return this.oauth.exchange(body.code);
	}

	/** Linked sign-in providers. */
	@ApiBearerAuth()
	@Get('users/me/identities')
	identities(@CurrentUser() user: AuthUser): Promise<IdentityDto[]> {
		return this.oauth.list(user.id);
	}

	@ApiBearerAuth()
	@Delete('users/me/identities/:provider')
	@HttpCode(204)
	unlink(@CurrentUser() user: AuthUser, @Param('provider') provider: string): Promise<void> {
		return this.oauth.unlink(user.id, provider);
	}
}

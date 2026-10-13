import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { claimsToUser } from '../../common/auth/auth-user';
import { ALLOW_GUEST_KEY, IS_PUBLIC_KEY, PUBLIC_IF_KEY } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';

/**
 * Global HTTP guard (registered as APP_GUARD). Every route needs a Bearer
 * access token unless marked `@Public()` (or `@PublicIf(configKey)` with the key true). Guest tokens are rejected unless
 * the route is marked `@AllowGuest()`. Only applies to HTTP — gateways
 * authenticate in their handshake.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly auth: AuthService,
		private readonly config: ConfigService,
	) {}

	async canActivate(ctx: ExecutionContext): Promise<boolean> {
		if (ctx.getType() !== 'http') return true;
		const targets = [ctx.getHandler(), ctx.getClass()];
		if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
		const publicIf = this.reflector.getAllAndOverride<string>(PUBLIC_IF_KEY, targets);
		if (publicIf && this.config.get<boolean>(publicIf)) return true;

		const req = ctx.switchToHttp().getRequest();
		const header: string | undefined = req.headers?.authorization;
		const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
		if (!token) throw new UnauthorizedException('missing bearer token');

		const claims = await this.auth.verify(token);
		if (claims.role === 'guest' && !this.reflector.getAllAndOverride<boolean>(ALLOW_GUEST_KEY, targets)) {
			throw new ForbiddenException('guest tokens cannot access this route');
		}
		req.user = claimsToUser(claims);
		return true;
	}
}

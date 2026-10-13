import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';

/** Injects the authenticated principal set by JwtAuthGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
	return ctx.switchToHttp().getRequest().user as AuthUser;
});

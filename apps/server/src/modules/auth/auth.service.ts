import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import type { AuthTokens } from '@chess/core';
import { AuthUser, claimsToUser, TokenClaims } from '../../common/auth/auth-user';
import { RateLimiter } from '../../cache/rate-limiter';
import { SessionsService } from './sessions.service';
import type { AuthSessionEntity } from './entities/auth-session.entity';
import { UsersService } from '../users/users.service';
import type { UserEntity } from '../users/entities/user.entity';
import type { GuestTokenResponse } from './dto/auth.dto';

/**
 * Issues and verifies JWTs. One secret, three token types told apart by the
 * `typ` claim: `access` (owner/user, short), `refresh` (long, only accepted
 * by /auth/refresh) and `guest` (display name only, no DB row).
 */
@Injectable()
export class AuthService {
	constructor(
		private readonly jwt: JwtService,
		private readonly users: UsersService,
		private readonly config: ConfigService,
		private readonly limits: RateLimiter,
		private readonly sessions: SessionsService,
	) {}

	/**
	 * Username (or email) + password → access/refresh pair. Same error for unknown user and bad password.
	 * Failed attempts are counted per username and per IP (LOGIN_MAX_PER_USER / _PER_IP in LOGIN_WINDOW) → 429.
	 */
	async login(username: string, password: string, ip?: string, userAgent?: string): Promise<AuthTokens> {
		const name = username.trim().toLowerCase();
		const window = this.config.get<number>('auth.loginWindow') ?? 900;
		const perUser = this.config.get<number>('auth.loginMaxPerUser') ?? 10;
		const perIp = this.config.get<number>('auth.loginMaxPerIp') ?? 30;
		const msg = 'too many sign-in attempts — try again in a few minutes';
		await this.limits.check(`login:u:${name}`, perUser, msg);
		await this.limits.check(`login:ip:${ip ?? 'unknown'}`, perIp, msg);
		const user = await this.users.findByIdentifier(name);
		if (!user || !(await this.users.verifyPassword(user, password))) {
			await this.limits.hit(`login:u:${name}`, perUser, window, msg);
			await this.limits.hit(`login:ip:${ip ?? 'unknown'}`, perIp, window, msg);
			throw new UnauthorizedException('invalid username or password');
		}
		await this.limits.reset(`login:u:${name}`);
		return this.tokensFor(user, { userAgent });
	}

	/** Exchanges a valid refresh token for a fresh pair (user is re-read so role/name changes apply). */
	async refresh(refreshToken: string, userAgent?: string): Promise<AuthTokens> {
		const claims = await this.verify(refreshToken, 'refresh');
		const user = await this.users.findById(claims.sub).catch(() => {
			throw new UnauthorizedException('user no longer exists');
		});
		// Password changed / reset since this token was issued → signed out.
		const iat = (claims as TokenClaims & { iat?: number }).iat ?? 0;
		if (iat < (user.tokensValidAfter ?? 0)) throw new UnauthorizedException('session ended — sign in again');
		// Tokens from before device sessions existed: start a session for them once.
		if (!claims.sid) return this.tokensFor(user, { userAgent });
		const r = await this.sessions.rotate(user.id, claims.sid, claims.rot ?? 0);
		if (!r.ok) throw new UnauthorizedException('session ended — sign in again');
		return this.issueTokens(user, r.session);
	}

	/** Ends the session of a refresh token (sign out). Invalid or expired tokens are ignored. */
	async logout(refreshToken: string): Promise<void> {
		const claims = await this.verify(refreshToken, 'refresh').catch(() => null);
		if (claims?.sid) await this.sessions.revokeQuietly(claims.sid);
	}

	/** Guest token: random id, chosen display name, no account. Used to join rooms. */
	async guest(displayName: string): Promise<GuestTokenResponse> {
		const id = `guest:${randomUUID()}`;
		const ttl = this.config.get<number>('auth.guestTtl')!;
		const claims: TokenClaims = { sub: id, username: id, name: displayName.trim(), role: 'guest', typ: 'guest' };
		const accessToken = await this.jwt.signAsync(claims, { expiresIn: ttl });
		return { accessToken, expiresIn: ttl, user: { id, username: id, displayName: claims.name, role: 'guest' } };
	}

	/**
	 * Verifies a token and returns its claims. `expected` restricts the token type;
	 * by default access + guest tokens are accepted (refresh tokens never authenticate requests).
	 */
	async verify(token: string, expected: TokenClaims['typ'] | 'any-access' = 'any-access'): Promise<TokenClaims> {
		let claims: TokenClaims;
		try {
			claims = await this.jwt.verifyAsync<TokenClaims>(token);
		} catch {
			throw new UnauthorizedException('invalid or expired token');
		}
		const ok = expected === 'any-access' ? claims.typ === 'access' || claims.typ === 'guest' : claims.typ === expected;
		if (!ok) throw new UnauthorizedException('wrong token type');
		return claims;
	}

	/** Token → principal (for socket handshakes). */
	async authenticate(token: string | undefined): Promise<AuthUser> {
		if (!token) throw new UnauthorizedException('missing token');
		return claimsToUser(await this.verify(token));
	}

	/**
	 * Tokens for a user on a device session: `sessionId` keeps (renews) that session, else a new session
	 * is created (sign-in, sign-up, provider sign-in, reset).
	 */
	async tokensFor(user: UserEntity, ctx: { userAgent?: string; sessionId?: string } = {}): Promise<AuthTokens> {
		const session = (ctx.sessionId ? await this.sessions.renew(ctx.sessionId) : null) ?? (await this.sessions.create(user.id, ctx.userAgent));
		return this.issueTokens(user, session);
	}

	private async issueTokens(user: UserEntity, session: AuthSessionEntity): Promise<AuthTokens> {
		const accessTtl = this.config.get<number>('auth.accessTtl')!;
		const refreshTtl = this.config.get<number>('auth.refreshTtl')!;
		const base = { sub: user.id, username: user.username, name: user.displayName, role: user.role, sid: session.id };
		const [accessToken, refreshToken] = await Promise.all([
			this.jwt.signAsync({ ...base, typ: 'access' } satisfies TokenClaims, { expiresIn: accessTtl }),
			this.jwt.signAsync({ ...base, typ: 'refresh', rot: session.rotation } satisfies TokenClaims, { expiresIn: refreshTtl }),
		]);
		return { accessToken, refreshToken, expiresIn: accessTtl, user: this.users.toDto(user) };
	}
}

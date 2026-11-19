import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import type { AuthTokens } from '@chess/core';
import { AuthUser, claimsToUser, TokenClaims } from '../../common/auth/auth-user';
import { RateLimiter } from '../../cache/rate-limiter';
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
	) {}

	/**
	 * Username (or email) + password → access/refresh pair. Same error for unknown user and bad password.
	 * Failed attempts are counted per username and per IP (LOGIN_MAX_PER_USER / _PER_IP in LOGIN_WINDOW) → 429.
	 */
	async login(username: string, password: string, ip?: string): Promise<AuthTokens> {
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
		return this.issueTokens(user);
	}

	/** Exchanges a valid refresh token for a fresh pair (user is re-read so role/name changes apply). */
	async refresh(refreshToken: string): Promise<AuthTokens> {
		const claims = await this.verify(refreshToken, 'refresh');
		const user = await this.users.findById(claims.sub).catch(() => {
			throw new UnauthorizedException('user no longer exists');
		});
		// Password changed / reset since this token was issued → signed out.
		const iat = (claims as TokenClaims & { iat?: number }).iat ?? 0;
		if (iat < (user.tokensValidAfter ?? 0)) throw new UnauthorizedException('session ended — sign in again');
		return this.issueTokens(user);
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

	/** Fresh access + refresh pair for a user (after a password reset / change). */
	tokensFor(user: UserEntity): Promise<AuthTokens> {
		return this.issueTokens(user);
	}

	private async issueTokens(user: UserEntity): Promise<AuthTokens> {
		const accessTtl = this.config.get<number>('auth.accessTtl')!;
		const refreshTtl = this.config.get<number>('auth.refreshTtl')!;
		const base = { sub: user.id, username: user.username, name: user.displayName, role: user.role };
		const [accessToken, refreshToken] = await Promise.all([
			this.jwt.signAsync({ ...base, typ: 'access' } satisfies TokenClaims, { expiresIn: accessTtl }),
			this.jwt.signAsync({ ...base, typ: 'refresh' } satisfies TokenClaims, { expiresIn: refreshTtl }),
		]);
		return { accessToken, refreshToken, expiresIn: accessTtl, user: this.users.toDto(user) };
	}
}

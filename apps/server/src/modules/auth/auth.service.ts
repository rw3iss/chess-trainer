import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import type { AuthTokens } from '@chess/core';
import { AuthUser, claimsToUser, TokenClaims } from '../../common/auth/auth-user';
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
	) {}

	/** Username + password → access/refresh pair. Same error for unknown user and bad password. */
	async login(username: string, password: string): Promise<AuthTokens> {
		const user = await this.users.findByUsername(username);
		if (!user || !(await this.users.verifyPassword(user, password))) {
			throw new UnauthorizedException('invalid username or password');
		}
		return this.issueTokens(user);
	}

	/** Exchanges a valid refresh token for a fresh pair (user is re-read so role/name changes apply). */
	async refresh(refreshToken: string): Promise<AuthTokens> {
		const claims = await this.verify(refreshToken, 'refresh');
		const user = await this.users.findById(claims.sub).catch(() => {
			throw new UnauthorizedException('user no longer exists');
		});
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

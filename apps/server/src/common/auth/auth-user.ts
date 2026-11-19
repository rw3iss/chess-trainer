import type { UserDto } from '@chess/core';

/** Claims carried in every access / guest JWT. */
export interface TokenClaims {
	sub: string;
	username: string;
	name: string;
	role: UserDto['role'];
	typ: 'access' | 'refresh' | 'guest';
	/** Device session id (auth_sessions) — access + refresh tokens of signed-in users. */
	sid?: string;
	/** Refresh token rotation counter (refresh tokens only). */
	rot?: number;
}

/** The authenticated principal attached to `request.user` / `socket.data.user`. */
export interface AuthUser {
	id: string;
	username: string;
	displayName: string;
	role: UserDto['role'];
	/** Device session of the token (absent for guests and pre-session tokens). */
	sid?: string;
}

export function claimsToUser(c: TokenClaims): AuthUser {
	return { id: c.sub, username: c.username, displayName: c.name, role: c.role, sid: c.sid };
}

import type { UserDto } from '@chess/core';

/** Claims carried in every access / guest JWT. */
export interface TokenClaims {
	sub: string;
	username: string;
	name: string;
	role: UserDto['role'];
	typ: 'access' | 'refresh' | 'guest';
}

/** The authenticated principal attached to `request.user` / `socket.data.user`. */
export interface AuthUser {
	id: string;
	username: string;
	displayName: string;
	role: UserDto['role'];
}

export function claimsToUser(c: TokenClaims): AuthUser {
	return { id: c.sub, username: c.username, displayName: c.name, role: c.role };
}

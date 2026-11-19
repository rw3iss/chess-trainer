import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { RateLimiter } from '../../cache/rate-limiter';
import { UsersService } from '../users/users.service';
import type { UserEntity } from '../users/entities/user.entity';
import { RecoveryCodeEntity } from './entities/recovery-code.entity';
import { SessionsService } from './sessions.service';

export const RECOVERY_CODE_COUNT = 8;
// Crockford-style base32 without look-alikes (no 0/o, 1/l/i, u).
const ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789';

/** Normalized form that is hashed: lower case, no spaces or dashes. */
export const normalizeCode = (c: string) => c.toLowerCase().replace(/[\s-]+/g, '');

function newCode(): string {
	const b = randomBytes(8);
	let s = '';
	for (let i = 0; i < 8; i++) s += ALPHABET[b[i]! % ALPHABET.length];
	return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** One-time recovery codes: reset a password with no email. */
@Injectable()
export class RecoveryService {
	constructor(
		@InjectRepository(RecoveryCodeEntity) private readonly repo: Repository<RecoveryCodeEntity>,
		private readonly users: UsersService,
		private readonly sessions: SessionsService,
		private readonly limits: RateLimiter,
	) {}

	/** New set of codes (old ones stop working). Needs the current password when the account has one. */
	async generate(userId: string, currentPassword: string): Promise<string[]> {
		const user = await this.users.findById(userId);
		if (user.passwordHash && !(await this.users.verifyPassword(user, currentPassword))) throw new UnauthorizedException('the current password is wrong');
		await this.repo.delete({ userId });
		const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newCode);
		const now = Date.now();
		const rows = await Promise.all(codes.map(async (c) => this.repo.create({ id: randomUUID(), userId, codeHash: await argon2.hash(normalizeCode(c)), usedAt: null, createdAt: now })));
		await this.repo.save(rows);
		return codes;
	}

	remaining(userId: string): Promise<number> {
		return this.repo.count({ where: { userId, usedAt: IsNull() } });
	}

	/** Username + unused code → new password; every session ends. Returns the user (caller issues tokens). */
	async recover(username: string, code: string, password: string, ip?: string): Promise<UserEntity> {
		const name = username.trim().toLowerCase();
		const msg = 'too many recovery attempts — try again later';
		await this.limits.hit(`recover:ip:${ip ?? 'unknown'}`, 10, 3600, msg);
		await this.limits.hit(`recover:u:${name}`, 5, 3600, msg);
		const user = await this.users.findByUsername(name);
		const fail = new BadRequestException('that username and recovery code do not match');
		if (!user) throw fail;
		const rows = await this.repo.find({ where: { userId: user.id, usedAt: IsNull() } });
		const norm = normalizeCode(code);
		let hit: RecoveryCodeEntity | null = null;
		for (const r of rows) {
			// oxlint-disable-next-line no-await-in-loop -- stop at the first match (≤ 8 codes)
			if (await argon2.verify(r.codeHash, norm).catch(() => false)) {
				hit = r;
				break;
			}
		}
		if (!hit) throw fail;
		hit.usedAt = Date.now();
		await this.repo.save(hit);
		await this.sessions.revokeAll(user.id);
		return this.users.setPassword(user, password);
	}
}

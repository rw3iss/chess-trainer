import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { CacheService } from '../../cache/cache.service';
import { Mailer, passwordResetMail } from '../mail';
import { UsersService } from '../users/users.service';
import type { UserEntity } from '../users/entities/user.entity';
import { PasswordResetEntity } from './entities/password-reset.entity';

/** Reset requests allowed per account and per client IP, per RATE_WINDOW_S. */
export const RESET_LIMIT_PER_ACCOUNT = 3;
export const RESET_LIMIT_PER_IP = 10;
const RATE_WINDOW_S = 3600;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Password reset by email + password change.
 * Reset links: 32 random bytes (base64url) in the email, only the SHA-256 stored; single use; expire after
 * PASSWORD_RESET_TTL. A successful reset or change bumps users.tokens_valid_after (signs out other sessions).
 */
@Injectable()
export class PasswordService {
	private readonly logger = new Logger(PasswordService.name);

	constructor(
		@InjectRepository(PasswordResetEntity) private readonly resets: Repository<PasswordResetEntity>,
		private readonly users: UsersService,
		private readonly mailer: Mailer,
		private readonly cache: CacheService,
		private readonly config: ConfigService,
	) {}

	/**
	 * Starts a reset for a username or email. Always resolves the same way whether or not the account
	 * exists or has an email (no enumeration); the email is sent in the background.
	 */
	async requestReset(identifier: string, ip: string | undefined): Promise<void> {
		if (!this.mailer.enabled) throw new ServiceUnavailableException('email is not configured on this server');
		const id = identifier.trim().toLowerCase();
		await this.hit(`pwreset:ip:${ip ?? 'unknown'}`, RESET_LIMIT_PER_IP);
		await this.hit(`pwreset:id:${sha256(id)}`, RESET_LIMIT_PER_ACCOUNT);
		const user = await this.users.findByIdentifier(id);
		if (!user?.email) return;
		void this.sendLink(user).catch((e: unknown) => this.logger.error(`reset email to user ${user.id} failed: ${e instanceof Error ? e.message : String(e)}`));
	}

	/** Completes a reset. Returns the user (caller issues tokens). */
	async reset(token: string, password: string): Promise<UserEntity> {
		const row = await this.resets.findOne({ where: { tokenHash: sha256(token) } });
		if (!row || row.usedAt !== null || row.expiresAt < Date.now()) throw new BadRequestException('this reset link is invalid or has expired');
		row.usedAt = Date.now();
		await this.resets.save(row);
		const user = await this.users.findById(row.userId).catch(() => {
			throw new BadRequestException('this reset link is invalid or has expired');
		});
		await this.clearUnused(user.id);
		return this.users.setPassword(user, password);
	}

	/** Signed-in password change. Returns the user (caller issues tokens). */
	async change(userId: string, currentPassword: string, newPassword: string): Promise<UserEntity> {
		const user = await this.users.findById(userId);
		if (!(await this.users.verifyPassword(user, currentPassword))) throw new UnauthorizedException('the current password is wrong');
		await this.clearUnused(user.id);
		return this.users.setPassword(user, newPassword);
	}

	private async sendLink(user: UserEntity): Promise<void> {
		const ttlS = this.config.get<number>('auth.passwordResetTtl') ?? 3600;
		const token = randomBytes(32).toString('base64url');
		const now = Date.now();
		await this.resets.save(this.resets.create({ id: randomUUID(), userId: user.id, tokenHash: sha256(token), expiresAt: now + ttlS * 1000, usedAt: null, createdAt: now }));
		const appUrl = this.config.get<string>('mail.appUrl')!;
		const mail = passwordResetMail({
			to: user.email!,
			appName: this.config.get<string>('mail.appName') ?? 'Chess Trainer',
			displayName: user.displayName,
			link: `${appUrl}/reset-password?token=${encodeURIComponent(token)}`,
			ttlMinutes: Math.round(ttlS / 60),
		});
		const res = await this.mailer.send(mail);
		this.logger.log(`reset email sent to user ${user.id} via ${this.mailer.provider}${res.id ? ` (${res.id})` : ''}`);
	}

	/** Unused links of a user stop working once the password changes. */
	private async clearUnused(userId: string): Promise<void> {
		const rows = await this.resets.find({ where: { userId } });
		const unused = rows.filter((r) => r.usedAt === null);
		if (unused.length) await this.resets.remove(unused);
	}

	private async hit(key: string, limit: number): Promise<void> {
		const n = ((await this.cache.get<number>(key)) ?? 0) + 1;
		if (n > limit) throw new HttpException('too many reset requests — try again later', HttpStatus.TOO_MANY_REQUESTS);
		await this.cache.set(key, n, RATE_WINDOW_S);
	}
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { RateLimiter } from '../../cache/rate-limiter';
import { Mailer, verifyEmailMail } from '../mail';
import { EmailVerificationEntity } from './entities/email-verification.entity';
import { UserEntity } from './entities/user.entity';

export const VERIFY_TTL_H = 24;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Email confirmation links (24 h, single use). Sending is best effort (logged on failure). */
@Injectable()
export class EmailVerificationService {
	private readonly logger = new Logger(EmailVerificationService.name);

	constructor(
		@InjectRepository(EmailVerificationEntity) private readonly repo: Repository<EmailVerificationEntity>,
		@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
		private readonly mailer: Mailer,
		private readonly limits: RateLimiter,
		private readonly config: ConfigService,
	) {}

	/** Emails a confirmation link for the user's current (unverified) email. No-op without email or mailer. */
	async send(user: UserEntity): Promise<void> {
		if (!user.email || user.emailVerified || !this.mailer.enabled) return;
		const token = randomBytes(32).toString('base64url');
		const now = Date.now();
		await this.repo.save(this.repo.create({ id: randomUUID(), userId: user.id, email: user.email, tokenHash: sha256(token), expiresAt: now + VERIFY_TTL_H * 3600_000, usedAt: null, createdAt: now }));
		const mail = verifyEmailMail({
			to: user.email,
			appName: this.config.get<string>('mail.appName') ?? 'Chess Trainer',
			displayName: user.displayName,
			link: `${this.config.get<string>('mail.appUrl')}/verify-email?token=${encodeURIComponent(token)}`,
			ttlHours: VERIFY_TTL_H,
		});
		void this.mailer.send(mail).catch((e: unknown) => this.logger.error(`verify email to user ${user.id} failed: ${e instanceof Error ? e.message : String(e)}`));
	}

	/** Signed-in "send the link again" (3 per hour). */
	async resend(user: UserEntity): Promise<void> {
		if (!user.email) throw new BadRequestException('add an email first');
		if (user.emailVerified) return;
		await this.limits.hit(`verify:${user.id}`, 3, 3600, 'too many confirmation emails — try again later');
		await this.send(user);
	}

	/** Confirms the email in the link if it is still the account's email. */
	async verify(token: string): Promise<{ email: string }> {
		const row = await this.repo.findOne({ where: { tokenHash: sha256(token) } });
		if (!row || row.usedAt !== null || row.expiresAt < Date.now()) throw new BadRequestException('this confirmation link is invalid or has expired');
		row.usedAt = Date.now();
		await this.repo.save(row);
		const user = await this.users.findOne({ where: { id: row.userId } });
		if (!user || user.email !== row.email) throw new BadRequestException('this confirmation link is for an email the account no longer uses');
		user.emailVerified = true;
		user.updatedAt = Date.now();
		await this.users.save(user);
		return { email: row.email };
	}
}

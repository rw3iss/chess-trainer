import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import type { InviteDto, InvitePreview } from '@chess/core';
import { RateLimiter } from '../../cache/rate-limiter';
import { inviteMail, Mailer } from '../mail';
import { UsersService } from '../users/users.service';
import { InviteEntity } from './entities/invite.entity';

const DAY_S = 24 * 3600;
/** New accounts wait this long before sending invites (limits spam from fresh sign-ups). The owner is exempt. */
export const INVITE_MIN_ACCOUNT_AGE_MS = DAY_S * 1000;

/** Friend invites: emailed sign-up links that record who invited whom (required when SIGNUP_MODE=invite). */
@Injectable()
export class InvitesService {
	private readonly logger = new Logger(InvitesService.name);

	constructor(
		@InjectRepository(InviteEntity) private readonly repo: Repository<InviteEntity>,
		private readonly users: UsersService,
		private readonly mailer: Mailer,
		private readonly limits: RateLimiter,
		private readonly config: ConfigService,
	) {}

	/** Creates an invite and emails it. Returns it with the link (to share by hand too). */
	async create(inviterId: string, email: string, message?: string): Promise<InviteDto> {
		if (!this.mailer.enabled) throw new ServiceUnavailableException('email is not configured on this server');
		const inviter = await this.users.findById(inviterId);
		if (inviter.role !== 'owner' && Date.now() - inviter.createdAt < INVITE_MIN_ACCOUNT_AGE_MS) {
			throw new ForbiddenException('new accounts can send invites after 24 hours');
		}
		const to = email.trim().toLowerCase();
		if (inviter.email === to) throw new BadRequestException('that is your own email');
		await this.limits.hit(`invite:${inviterId}`, this.config.get<number>('auth.invitesPerDay') ?? 10, DAY_S, 'invite limit reached for today');
		const invite = await this.repo.save(this.repo.create({ code: randomBytes(12).toString('base64url'), inviterId, email: to, createdAt: Date.now(), acceptedAt: null, acceptedBy: null }));
		const link = this.link(invite.code);
		const mail = inviteMail({
			to,
			appName: this.config.get<string>('mail.appName') ?? 'Chess Trainer',
			inviterName: inviter.displayName,
			inviterUsername: inviter.username,
			link,
			message: message?.slice(0, 500),
		});
		void this.mailer.send(mail).catch((e: unknown) => this.logger.error(`invite email failed: ${e instanceof Error ? e.message : String(e)}`));
		return this.toDto(invite);
	}

	async listMine(inviterId: string): Promise<InviteDto[]> {
		const rows = await this.repo.find({ where: { inviterId }, order: { createdAt: 'DESC' }, take: 100 });
		return rows.map((r) => this.toDto(r));
	}

	/** Public preview for the sign-up page. 404 for unknown or used codes. */
	async preview(code: string): Promise<InvitePreview> {
		const invite = await this.usable(code);
		const inviter = await this.users.findById(invite.inviterId).catch(() => null);
		if (!inviter) throw new NotFoundException('invite not found');
		return { inviter: { username: inviter.username, displayName: inviter.displayName }, email: invite.email };
	}

	/** An unused invite, or 404. */
	async usable(code: string): Promise<InviteEntity> {
		const invite = await this.repo.findOne({ where: { code } });
		if (!invite || invite.acceptedAt !== null) throw new NotFoundException('invite not found or already used');
		return invite;
	}

	async accept(code: string, userId: string): Promise<void> {
		await this.repo.update({ code }, { acceptedAt: Date.now(), acceptedBy: userId });
	}

	private link(code: string): string {
		return `${this.config.get<string>('mail.appUrl')}/signup?invite=${encodeURIComponent(code)}`;
	}

	private toDto(r: InviteEntity): InviteDto {
		return { code: r.code, link: this.link(r.code), email: r.email, createdAt: r.createdAt, acceptedAt: r.acceptedAt };
	}
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { IsNull, Not, Repository } from 'typeorm';
import type { DeviceSessionDto } from '@chess/core';
import { AuthSessionEntity } from './entities/auth-session.entity';

/** Two refreshes of one token within this window are a tab race, not theft. */
const ROTATION_GRACE_MS = 30_000;

/** "Firefox on Linux" from a user agent (rough; for the devices list only). */
export function deviceLabel(ua: string | undefined): string {
	if (!ua) return 'Unknown device';
	const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|undici|okhttp/i.test(ua) ? 'App' : 'Browser';
	const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
	return os ? `${browser} on ${os}` : browser;
}

export type RotateResult = { ok: true; session: AuthSessionEntity } | { ok: false; reason: 'gone' | 'reused' };

/** Signed-in devices (auth_sessions) and refresh-token rotation. */
@Injectable()
export class SessionsService {
	constructor(@InjectRepository(AuthSessionEntity) private readonly repo: Repository<AuthSessionEntity>) {}

	create(userId: string, userAgent?: string): Promise<AuthSessionEntity> {
		const now = Date.now();
		return this.repo.save(this.repo.create({ id: randomUUID(), userId, rotation: 0, label: deviceLabel(userAgent).slice(0, 128), createdAt: now, lastUsedAt: now, revokedAt: null }));
	}

	/**
	 * A refresh token (sid, rot) was presented. Current rotation → bump. The previous rotation within
	 * ROTATION_GRACE_MS → same rotation again (two tabs refreshed at once). Older → token reuse: revoke.
	 */
	async rotate(userId: string, sid: string, rot: number): Promise<RotateResult> {
		const s = await this.repo.findOne({ where: { id: sid } });
		if (!s || s.userId !== userId || s.revokedAt !== null) return { ok: false, reason: 'gone' };
		const now = Date.now();
		if (rot === s.rotation) {
			s.rotation += 1;
			s.lastUsedAt = now;
			return { ok: true, session: await this.repo.save(s) };
		}
		if (rot === s.rotation - 1 && now - s.lastUsedAt < ROTATION_GRACE_MS) return { ok: true, session: s };
		s.revokedAt = now;
		await this.repo.save(s);
		return { ok: false, reason: 'reused' };
	}

	/** Keeps the session, bumps its rotation (fresh tokens after a password change on this device). */
	async renew(sid: string): Promise<AuthSessionEntity | null> {
		const s = await this.repo.findOne({ where: { id: sid, revokedAt: IsNull() } });
		if (!s) return null;
		s.rotation += 1;
		s.lastUsedAt = Date.now();
		return this.repo.save(s);
	}

	async list(userId: string, currentSid?: string): Promise<DeviceSessionDto[]> {
		const rows = await this.repo.find({ where: { userId, revokedAt: IsNull() }, order: { lastUsedAt: 'DESC' } });
		return rows.map((r) => ({ id: r.id, label: r.label, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt, current: r.id === currentSid }));
	}

	async revoke(userId: string, id: string): Promise<void> {
		const s = await this.repo.findOne({ where: { id } });
		if (!s || s.revokedAt !== null) throw new NotFoundException('session not found');
		if (s.userId !== userId) throw new ForbiddenException('not your session');
		s.revokedAt = Date.now();
		await this.repo.save(s);
	}

	/** Revokes every active session of the user except `keep`. */
	async revokeAll(userId: string, keep?: string): Promise<void> {
		const where = keep ? { userId, revokedAt: IsNull(), id: Not(keep) } : { userId, revokedAt: IsNull() };
		await this.repo.update(where, { revokedAt: Date.now() });
	}

	async revokeQuietly(id: string): Promise<void> {
		await this.repo.update({ id, revokedAt: IsNull() }, { revokedAt: Date.now() });
	}
}

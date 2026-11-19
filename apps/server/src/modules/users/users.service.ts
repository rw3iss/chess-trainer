import { ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import type { UserDto } from '@chess/core';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class UsersService implements OnApplicationBootstrap {
	private readonly logger = new Logger(UsersService.name);

	constructor(
		@InjectRepository(UserEntity) private readonly repo: Repository<UserEntity>,
		private readonly config: ConfigService,
	) {}

	/** Seeds / updates the owner account from OWNER_USERNAME + OWNER_PASSWORD. Env is the source of truth. */
	async onApplicationBootstrap(): Promise<void> {
		const username = this.config.get<string>('auth.ownerUsername');
		const password = this.config.get<string>('auth.ownerPassword');
		if (!username || !password) {
			this.logger.warn('OWNER_USERNAME / OWNER_PASSWORD not set — no owner account (only guest tokens work)');
			return;
		}
		const owner = await this.upsertOwner(username, password);
		const email = this.config.get<string>('auth.ownerEmail');
		if (email && owner.email !== email) {
			await this.update(owner.id, { email }).catch((e: unknown) => this.logger.warn(`OWNER_EMAIL not applied: ${e instanceof Error ? e.message : String(e)}`));
		}
	}

	async upsertOwner(rawUsername: string, password: string): Promise<UserEntity> {
		const username = rawUsername.trim().toLowerCase();
		const existing = await this.findByUsername(username);
		const now = Date.now();
		if (existing) {
			if (existing.passwordHash && (await argon2.verify(existing.passwordHash, password))) return existing;
			existing.passwordHash = await argon2.hash(password);
			existing.updatedAt = now;
			this.logger.log(`owner '${username}' password updated from env`);
			return this.repo.save(existing);
		}
		const user = this.repo.create({
			id: randomUUID(),
			username,
			displayName: username,
			passwordHash: await argon2.hash(password),
			role: 'owner',
			email: null,
			tokensValidAfter: 0,
			preferences: null,
			createdAt: now,
			updatedAt: now,
		});
		this.logger.log(`owner '${username}' created`);
		return this.repo.save(user);
	}

	/** Looks up a user by username (case-insensitive: usernames are stored lower-case). */
	findByUsername(username: string): Promise<UserEntity | null> {
		return this.repo.findOne({ where: { username: username.trim().toLowerCase() } });
	}

	/** Looks up a user by email (stored lower-case). */
	findByEmail(email: string): Promise<UserEntity | null> {
		return this.repo.findOne({ where: { email: email.trim().toLowerCase() } });
	}

	/** Username or email (anything with '@' is treated as an email). */
	findByIdentifier(identifier: string): Promise<UserEntity | null> {
		return identifier.includes('@') ? this.findByEmail(identifier) : this.findByUsername(identifier);
	}

	/**
	 * Sets a new password and signs out every session: refresh tokens issued before now are refused.
	 * (Access tokens live at most JWT_ACCESS_TTL.) Returns the saved user.
	 */
	async setPassword(user: UserEntity, password: string): Promise<UserEntity> {
		user.passwordHash = await argon2.hash(password);
		// Tokens issued in this same second stay valid (iat has 1 s resolution); the caller issues fresh ones next.
		user.tokensValidAfter = Math.floor(Date.now() / 1000);
		user.updatedAt = Date.now();
		return this.repo.save(user);
	}

	async findById(id: string): Promise<UserEntity> {
		const user = await this.repo.findOne({ where: { id } });
		if (!user) throw new NotFoundException('user not found');
		return user;
	}

	/** Returns true when username + password match a stored account. */
	async verifyPassword(user: UserEntity, password: string): Promise<boolean> {
		if (!user.passwordHash) return false;
		try {
			return await argon2.verify(user.passwordHash, password);
		} catch {
			return false;
		}
	}

	count(): Promise<number> {
		return this.repo.count();
	}

	/** `email`: '' or null clears it; 409 when another account uses it. */
	async update(id: string, patch: { displayName?: string; preferences?: Record<string, unknown>; email?: string | null }): Promise<UserEntity> {
		const user = await this.findById(id);
		if (patch.displayName !== undefined) user.displayName = patch.displayName;
		if (patch.email !== undefined) {
			const email = patch.email ? patch.email.trim().toLowerCase() : null;
			if (email && email !== user.email) {
				const other = await this.findByEmail(email);
				if (other && other.id !== user.id) throw new ConflictException('that email is used by another account');
			}
			user.email = email;
		}
		if (patch.preferences !== undefined) user.preferences = patch.preferences;
		user.updatedAt = Date.now();
		return this.repo.save(user);
	}

	toDto(user: UserEntity): UserDto {
		return { id: user.id, username: user.username, displayName: user.displayName, role: user.role, email: user.email ?? null };
	}
}

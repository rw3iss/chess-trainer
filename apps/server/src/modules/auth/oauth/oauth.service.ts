import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import type { IdentityDto, OAuthExchangeResponse, OAuthProviderId, OAuthStartRequest } from '@chess/core';
import { CacheService } from '../../../cache/cache.service';
import { UsersService } from '../../users/users.service';
import type { UserEntity } from '../../users/entities/user.entity';
import { AuthService } from '../auth.service';
import { UserIdentityEntity } from '../entities/user-identity.entity';
import { RegistrationService } from '../registration.service';
import { IdentityProvider, type ProviderProfile } from './identity-provider';

export const IDENTITY_PROVIDERS = Symbol('IDENTITY_PROVIDERS');

const STATE_TTL_S = 600;
const CODE_TTL_S = 120;

interface PendingState {
	provider: OAuthProviderId;
	mode: 'signin' | 'link';
	userId: string | null;
	userAgent?: string;
	appOrigin: string;
	redirectUri: string;
	verifier: string;
	returnTo: string;
	invite?: string;
	ip?: string;
}

interface PendingCode {
	userId: string;
	userAgent?: string;
	returnTo: string;
	created: boolean;
	linked: boolean;
}

/** User-facing error carried back to the app as `#error=`. */
class SignInError extends Error {}

const b64url = (b: Buffer) => b.toString('base64url');

/**
 * Provider sign-in (authorization code + PKCE). Browser flow:
 *   app POST /auth/oauth/:p/start → { url } → provider → GET /auth/:p/callback (here) →
 *   302 <appOrigin>/auth/callback#code=… → app POST /auth/oauth/exchange { code } → tokens.
 * Tokens never travel in a URL; the exchange code is single use and lives 2 minutes.
 */
@Injectable()
export class OAuthService {
	private readonly logger = new Logger(OAuthService.name);
	private readonly providers: Map<OAuthProviderId, IdentityProvider>;

	constructor(
		@Inject(IDENTITY_PROVIDERS) providers: IdentityProvider[],
		@InjectRepository(UserIdentityEntity) private readonly identities: Repository<UserIdentityEntity>,
		private readonly users: UsersService,
		private readonly auth: AuthService,
		private readonly registration: RegistrationService,
		private readonly cache: CacheService,
		private readonly config: ConfigService,
	) {
		this.providers = new Map(providers.map((p) => [p.id, p]));
	}

	/** Configured providers (for /health). */
	enabledProviders(): OAuthProviderId[] {
		return [...this.providers.values()].filter((p) => p.enabled).map((p) => p.id);
	}

	async start(providerId: string, req: OAuthStartRequest, userId: string | null, ip?: string, userAgent?: string): Promise<{ url: string }> {
		const provider = this.provider(providerId);
		const appOrigin = this.allowedOrigin(req.appOrigin, 'appOrigin');
		const apiBase = req.apiBase.replace(/\/+$/, '');
		this.allowedOrigin(apiBase, 'apiBase');
		if (req.mode === 'link' && !userId) throw new UnauthorizedException('sign in first to link an account');
		const returnTo = req.returnTo && req.returnTo.startsWith('/') && !req.returnTo.startsWith('//') ? req.returnTo : '/';
		const state = b64url(randomBytes(24));
		const verifier = b64url(randomBytes(32));
		const redirectUri = `${apiBase}/auth/${provider.id}/callback`;
		const pending: PendingState = { provider: provider.id, mode: req.mode, userId: req.mode === 'link' ? userId : null, appOrigin, redirectUri, verifier, returnTo, invite: req.invite, ip, userAgent };
		await this.cache.set(`oauth:state:${state}`, pending, STATE_TTL_S);
		const codeChallenge = b64url(createHash('sha256').update(verifier).digest());
		return { url: provider.authorizeUrl({ state, codeChallenge, redirectUri }) };
	}

	/** Handles the provider redirect. Returns where to send the browser. Throws 400 only for an unknown state. */
	async callback(providerId: string, q: { code?: string; state?: string; error?: string }): Promise<string> {
		const key = `oauth:state:${q.state ?? ''}`;
		const pending = q.state ? await this.cache.get<PendingState>(key) : undefined;
		if (!pending || pending.provider !== providerId) throw new BadRequestException('this sign-in link expired — start again from the app');
		await this.cache.del(key);
		const back = (frag: string) => `${pending.appOrigin}/auth/callback#${frag}`;
		const fail = (message: string) => back(`error=${encodeURIComponent(message)}`);
		if (q.error || !q.code) return fail(q.error === 'access_denied' ? 'Sign-in was cancelled.' : 'Sign-in failed. Try again.');
		const provider = this.provider(providerId);
		let profile: ProviderProfile;
		try {
			profile = await provider.profile({ code: q.code, codeVerifier: pending.verifier, redirectUri: pending.redirectUri });
		} catch (e) {
			this.logger.warn(`${providerId} profile failed: ${e instanceof Error ? e.message : String(e)}`);
			return fail(`${this.name(providerId)} sign-in failed. Try again.`);
		}
		try {
			const result = await this.resolve(pending, profile);
			const code = b64url(randomBytes(24));
			await this.cache.set(`oauth:code:${code}`, { ...result, returnTo: pending.returnTo, userAgent: pending.userAgent } satisfies PendingCode, CODE_TTL_S);
			return back(`code=${code}`);
		} catch (e) {
			if (e instanceof SignInError) return fail(e.message);
			const msg = e instanceof Error ? e.message : String(e);
			this.logger.error(`${providerId} sign-in failed: ${msg}`);
			return fail(/sign-up|invite|too many/i.test(msg) ? msg.charAt(0).toUpperCase() + msg.slice(1) + '.' : 'Sign-in failed. Try again.');
		}
	}

	async exchange(code: string): Promise<OAuthExchangeResponse> {
		const key = `oauth:code:${code}`;
		const pending = await this.cache.get<PendingCode>(key);
		if (!pending) throw new BadRequestException('this sign-in expired — start again');
		await this.cache.del(key);
		const user = await this.users.findById(pending.userId);
		const tokens = await this.auth.tokensFor(user, { userAgent: pending.userAgent });
		return { ...tokens, returnTo: pending.returnTo, created: pending.created, linked: pending.linked };
	}

	async list(userId: string): Promise<IdentityDto[]> {
		const rows = await this.identities.find({ where: { userId }, order: { linkedAt: 'ASC' } });
		return rows.map((r) => ({ provider: r.provider, label: r.label, linkedAt: r.linkedAt }));
	}

	/** 409 when it is the only way left to sign in (no password, no other link). */
	async unlink(userId: string, providerId: string): Promise<void> {
		const rows = await this.identities.find({ where: { userId } });
		const row = rows.find((r) => r.provider === providerId);
		if (!row) throw new NotFoundException('not linked');
		const user = await this.users.findById(userId);
		if (!user.passwordHash && rows.length === 1) throw new ConflictException('set a password first — this is your only way to sign in');
		await this.identities.remove(row);
	}

	private async resolve(pending: PendingState, profile: ProviderProfile): Promise<Omit<PendingCode, 'returnTo'>> {
		const provider = pending.provider;
		const existing = await this.identities.findOne({ where: { provider, subject: profile.subject } });
		const name = this.name(provider);

		if (pending.mode === 'link') {
			if (existing && existing.userId !== pending.userId) throw new SignInError(`That ${name} account is linked to another user.`);
			if (!existing) {
				const already = await this.identities.findOne({ where: { provider, userId: pending.userId! } });
				if (already) throw new SignInError(`Your account is already linked to a ${name} account. Unlink it first.`);
				await this.link(pending.userId!, provider, profile);
			}
			return { userId: pending.userId!, created: false, linked: true };
		}

		if (existing) {
			const user = await this.users.findById(existing.userId).catch(() => null);
			if (user) return { userId: user.id, created: false, linked: false };
			await this.identities.remove(existing);
		}

		// No link yet. Never attach to an existing account by email alone (account takeover risk).
		const verifiedEmail = profile.email && profile.emailVerified ? profile.email : null;
		if (verifiedEmail) {
			const holder = await this.users.findByEmail(verifiedEmail);
			if (holder?.emailVerified) throw new SignInError(`An account with ${verifiedEmail} already exists. Sign in with your password, then link ${name} on your profile.`);
			// An unconfirmed claim on the address loses it to the provider-verified owner.
			if (holder) await this.users.releaseUnverifiedEmail(verifiedEmail);
		}
		const invite = await this.registration.admit(pending.invite, pending.ip);
		const username = await this.users.freeUsername(profile.username ?? profile.email?.split('@')[0] ?? profile.name ?? 'player');
		const user: UserEntity = await this.registration.create(
			{ username, password: null, displayName: profile.name ?? profile.username ?? username, email: verifiedEmail, emailVerified: !!verifiedEmail },
			invite,
		);
		await this.link(user.id, provider, profile);
		this.logger.log(`account ${user.username} created via ${provider}`);
		return { userId: user.id, created: true, linked: false };
	}

	private async link(userId: string, provider: OAuthProviderId, profile: ProviderProfile): Promise<void> {
		await this.identities.save(this.identities.create({ provider, subject: profile.subject, userId, label: profile.label.slice(0, 255), linkedAt: Date.now() }));
	}

	private provider(id: string): IdentityProvider {
		const p = this.providers.get(id as OAuthProviderId);
		if (!p?.enabled) throw new NotFoundException(`sign-in with ${id} is not available`);
		return p;
	}

	private name(id: OAuthProviderId): string {
		return id === 'google' ? 'Google' : id === 'lichess' ? 'Lichess' : id;
	}

	/** The origin of `url` when it is one of ours (CORS_ORIGINS, APP_PUBLIC_URL; any localhost outside production). */
	private allowedOrigin(url: string, field: string): string {
		let origin: string;
		try {
			origin = new URL(url).origin;
		} catch {
			throw new BadRequestException(`${field} is not a URL`);
		}
		const allowed = new Set<string>();
		const cors = this.config.get<string>('app.corsOrigins') ?? '';
		if (cors && cors !== '*') for (const o of cors.split(',')) if (o.trim()) allowed.add(new URL(o.trim()).origin);
		allowed.add(new URL(this.config.get<string>('mail.appUrl')!).origin);
		const dev = this.config.get<string>('app.env') !== 'production';
		if (allowed.has(origin) || (dev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) return origin;
		throw new BadRequestException(`${field} ${origin} is not allowed`);
	}
}

import { IdentityProvider, type ProviderProfile } from '../identity-provider';

export interface GoogleProviderOptions {
	clientId?: string;
	clientSecret?: string;
	/** Injected for tests. */
	fetch?: typeof fetch;
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * Google OpenID Connect (code + PKCE, scopes openid email profile). The profile comes from the
 * userinfo endpoint, called server-to-server over TLS with the access token Google just issued.
 */
export class GoogleProvider extends IdentityProvider {
	readonly id = 'google' as const;
	private readonly fetchFn: typeof fetch;

	constructor(private readonly opts: GoogleProviderOptions) {
		super();
		this.fetchFn = opts.fetch ?? fetch;
	}

	get enabled(): boolean {
		return !!(this.opts.clientId && this.opts.clientSecret);
	}

	authorizeUrl(p: { state: string; codeChallenge: string; redirectUri: string }): string {
		const q = new URLSearchParams({
			client_id: this.opts.clientId!,
			redirect_uri: p.redirectUri,
			response_type: 'code',
			scope: 'openid email profile',
			state: p.state,
			code_challenge: p.codeChallenge,
			code_challenge_method: 'S256',
			prompt: 'select_account',
		});
		return `${AUTH_URL}?${q}`;
	}

	async profile(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<ProviderProfile> {
		const tokenRes = await this.fetchFn(TOKEN_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				code: p.code,
				client_id: this.opts.clientId!,
				client_secret: this.opts.clientSecret!,
				redirect_uri: p.redirectUri,
				grant_type: 'authorization_code',
				code_verifier: p.codeVerifier,
			}),
			signal: AbortSignal.timeout(10_000),
		});
		const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
		if (!tokenRes.ok || !token.access_token) throw new Error(`google token: ${token.error_description ?? token.error ?? `HTTP ${tokenRes.status}`}`);
		const infoRes = await this.fetchFn(USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) });
		const info = (await infoRes.json().catch(() => ({}))) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
		if (!infoRes.ok || !info.sub) throw new Error(`google userinfo: HTTP ${infoRes.status}`);
		return {
			subject: info.sub,
			email: info.email?.toLowerCase(),
			emailVerified: info.email_verified === true,
			name: info.name,
			label: info.email ?? info.name ?? 'Google account',
		};
	}
}

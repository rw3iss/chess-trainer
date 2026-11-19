import { IdentityProvider, type ProviderProfile } from '../identity-provider';

export interface LichessProviderOptions {
	enabled: boolean;
	/** Any stable name; Lichess shows it on the consent screen. No registration, no secret. */
	clientId: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}

/**
 * Lichess OAuth 2 (code + PKCE, no scopes = identity only). After reading the account, the access
 * token is revoked: the app imports public games without it.
 */
export class LichessProvider extends IdentityProvider {
	readonly id = 'lichess' as const;
	private readonly fetchFn: typeof fetch;
	private readonly base: string;

	constructor(private readonly opts: LichessProviderOptions) {
		super();
		this.fetchFn = opts.fetch ?? fetch;
		this.base = (opts.baseUrl ?? 'https://lichess.org').replace(/\/+$/, '');
	}

	get enabled(): boolean {
		return this.opts.enabled && !!this.opts.clientId;
	}

	authorizeUrl(p: { state: string; codeChallenge: string; redirectUri: string }): string {
		const q = new URLSearchParams({
			response_type: 'code',
			client_id: this.opts.clientId,
			redirect_uri: p.redirectUri,
			code_challenge_method: 'S256',
			code_challenge: p.codeChallenge,
			state: p.state,
		});
		return `${this.base}/oauth?${q}`;
	}

	async profile(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<ProviderProfile> {
		const tokenRes = await this.fetchFn(`${this.base}/api/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'chess-trainer-server' },
			body: new URLSearchParams({ grant_type: 'authorization_code', code: p.code, code_verifier: p.codeVerifier, redirect_uri: p.redirectUri, client_id: this.opts.clientId }),
			signal: AbortSignal.timeout(10_000),
		});
		const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
		if (!tokenRes.ok || !token.access_token) throw new Error(`lichess token: ${token.error_description ?? token.error ?? `HTTP ${tokenRes.status}`}`);
		const auth = { Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'chess-trainer-server' };
		try {
			const res = await this.fetchFn(`${this.base}/api/account`, { headers: auth, signal: AbortSignal.timeout(10_000) });
			const acc = (await res.json().catch(() => ({}))) as { id?: string; username?: string };
			if (!res.ok || !acc.id) throw new Error(`lichess account: HTTP ${res.status}`);
			const username = acc.username ?? acc.id;
			return { subject: acc.id, username, name: username, label: username };
		} finally {
			void this.fetchFn(`${this.base}/api/token`, { method: 'DELETE', headers: auth, signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
		}
	}
}

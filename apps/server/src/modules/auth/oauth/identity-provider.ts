import type { OAuthProviderId } from '@chess/core';

/** What a provider tells us about the person after sign-in. */
export interface ProviderProfile {
	/** Stable provider user id. */
	subject: string;
	email?: string;
	emailVerified?: boolean;
	name?: string;
	/** Provider username (e.g. Lichess), used to suggest a username. */
	username?: string;
	/** Shown in the app for the link (email or username). */
	label: string;
}

/**
 * Sign-in provider port (OAuth 2 authorization code + PKCE). Implement it to add a provider
 * (Google today; Lichess next) and register it in OAuthModule's provider list.
 */
export abstract class IdentityProvider {
	abstract readonly id: OAuthProviderId;
	/** True when configured (client id / secret present). Unconfigured providers are not offered. */
	abstract readonly enabled: boolean;
	/** URL to send the browser to. */
	abstract authorizeUrl(p: { state: string; codeChallenge: string; redirectUri: string }): string;
	/** Exchanges the code for the user's profile. Throws on any failure. */
	abstract profile(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<ProviderProfile>;
}

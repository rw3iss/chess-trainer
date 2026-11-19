// "Continue with Google" (and later Lichess) — shown only for providers the server reports in
// /health features.oauth. Navigates away to the provider; it returns to /auth/callback.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { OAuthProviderId } from '@chess/core/protocol';
import { Button } from '@/components/common';
import { serverConnector } from '@/services/server';
import { authActions } from '@/state/auth';
import './account.scss';

export const PROVIDER_NAME: Record<OAuthProviderId, string> = { google: 'Google', lichess: 'Lichess' };

/** Providers the connected server offers. */
export function availableProviders(): OAuthProviderId[] {
	if (serverConnector.status.value !== 'online') return [];
	return (serverConnector.health.value?.features?.oauth ?? []).filter((p): p is OAuthProviderId => p in PROVIDER_NAME);
}

function GoogleMark(): JSX.Element {
	return (
		<svg class="provider-btn__mark" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
			<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
			<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
			<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
			<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
		</svg>
	);
}

export interface ProviderButtonsProps {
	mode?: 'signin' | 'link';
	returnTo?: string;
	invite?: string;
	/** Already linked providers (link mode hides them). */
	exclude?: OAuthProviderId[];
	label?: (name: string) => string;
}

export function ProviderButtons({ mode = 'signin', returnTo, invite, exclude = [], label }: ProviderButtonsProps): JSX.Element | null {
	const [busy, setBusy] = useState<OAuthProviderId | null>(null);
	const [error, setError] = useState<string | null>(null);
	const providers = availableProviders().filter((p) => !exclude.includes(p));
	if (!providers.length) return null;
	return (
		<div class="provider-buttons">
			{providers.map((p) => (
				<Button
					key={p}
					variant="secondary"
					block
					class="provider-btn"
					loading={busy === p}
					onClick={() => {
						setBusy(p);
						setError(null);
						authActions.startOAuth(p, mode, { returnTo, invite }).catch((e: unknown) => {
							setBusy(null);
							setError(e instanceof Error ? e.message : String(e));
						});
					}}
				>
					{p === 'google' && <GoogleMark />}
					{label ? label(PROVIDER_NAME[p]) : mode === 'link' ? `Link ${PROVIDER_NAME[p]}` : `Continue with ${PROVIDER_NAME[p]}`}
				</Button>
			))}
			{error && (
				<p class="account-error" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}

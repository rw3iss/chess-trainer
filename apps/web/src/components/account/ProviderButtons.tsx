// "Continue with Google / Lichess" — shown only for providers the server reports in
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

/** Lichess's knight mark (simplified). */
function LichessMark(): JSX.Element {
	return (
		<svg class="provider-btn__mark" viewBox="0 0 50 50" width="18" height="18" aria-hidden="true">
			<path
				fill="currentColor"
				d="M38.96 9.38c-2.13-1.96-4.66-3.24-7.27-3.86l-1.16-3.53-2.56 3.1c-.6-.02-1.2 0-1.8.05L23.4 2l-1.12 3.92C14.2 8.2 8.5 15.56 8.5 24.2c0 1.64.2 3.24.6 4.77l-4.6 6.67 3.7 2.6 4.2-5.8c.8.9 1.86 1.42 3 1.42h.13l-3.13 8.3 4.28 1.62 3.3-8.75c1.26-.5 2.38-1.28 3.28-2.27l1.6 1.06c-1.47 3.72-4.55 7.68-9.27 10.2l2.1 4.04c8.36-4.46 12.5-12.66 12.5-19.2 0-1.45-.25-2.92-.74-4.33l3.04-.92c.32 1.65.48 3.33.48 5 0 8.27-3.92 15.6-10 20.2l2.66 3.6C37.2 41.1 41.9 32.2 41.9 23.04c0-5.03-1.06-9.73-2.94-13.66z"
			/>
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
					{p === 'lichess' && <LichessMark />}
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

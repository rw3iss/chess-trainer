// /auth/callback#code=… | #error=… — where the server sends the browser after a provider sign-in
// (Google). Exchanges the single-use code for tokens (authActions.completeOAuth); the account layer
// then opens that account's database and goes to `returnTo`.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@/components/common';
import { Spinner } from '@/components/common/Spinner';
import { serverConnector } from '@/services/server';
import { toast } from '@/services/toast';
import { accountSwitching } from '@/state/account';
import { authActions } from '@/state/auth';
import '../Signup/Signup.scss';

/** Parses `#code=…&error=…` (also accepts the query string). */
export function parseCallback(hash: string, search = ''): { code: string | null; error: string | null } {
	const p = new URLSearchParams(hash.replace(/^#/, ''));
	const q = new URLSearchParams(search.replace(/^\?/, ''));
	return { code: p.get('code') ?? q.get('code'), error: p.get('error') ?? q.get('error') };
}

export default function AuthCallback(): JSX.Element {
	const { route } = useLocation();
	const [{ code, error: providerError }] = useState(() => parseCallback(window.location.hash, window.location.search));
	const [error, setError] = useState<string | null>(providerError);
	const started = useRef(false);
	const url = serverConnector.url.value;

	useEffect(() => {
		// Drop the code from the address bar (it is single use).
		if (window.location.hash) history.replaceState(history.state, '', window.location.pathname);
	}, []);

	useEffect(() => {
		if (started.current || !code || providerError || !url) return;
		started.current = true;
		authActions.completeOAuth(code).then(
			(r) => {
				if (accountSwitching.value) return;
				toast.success(r.linked ? 'Google linked' : r.created ? 'Account created' : 'Signed in with Google');
				route(r.returnTo || '/', true);
			},
			(e: unknown) => setError(e instanceof Error ? e.message : String(e)),
		);
	}, [code, providerError, url]);

	if (error || !code) {
		return (
			<section class="auth-page" aria-labelledby="auth-callback-title">
				<h2 class="auth-page__title" id="auth-callback-title">
					Sign-in failed
				</h2>
				<p class="auth-page__text" role="alert">
					{error ?? 'The sign-in link is missing its code. Try again.'}
				</p>
				<div class="auth-page__actions">
					<Button variant="secondary" onClick={() => route('/settings/server')}>
						Back to sign in
					</Button>
				</div>
			</section>
		);
	}
	return (
		<section class="auth-page" aria-labelledby="auth-callback-title" aria-busy="true">
			<h2 class="auth-page__title" id="auth-callback-title">
				Signing in…
			</h2>
			<Spinner />
		</section>
	);
}

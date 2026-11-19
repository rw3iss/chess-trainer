// /verify-email?token=… — the page an email verification link opens. Confirms the email
// (authActions.verifyEmail, public: works signed out too) and links to the profile.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@/components/common';
import { Spinner } from '@/components/common/Spinner';
import { serverConnector } from '@/services/server';
import { authActions } from '@/state/auth';
import '../Signup/Signup.scss';

type State = { kind: 'working' } | { kind: 'done'; email: string } | { kind: 'error'; message: string };

export default function VerifyEmail(): JSX.Element {
	const { query, route } = useLocation();
	const token = (query.token ?? '').trim();
	const status = serverConnector.status.value;
	const [state, setState] = useState<State>(token ? { kind: 'working' } : { kind: 'error', message: 'This link has no verification code. Open the link from the email again.' });
	const started = useRef(false);

	// Wait until the server answered: the configured URL may still be a default that is not probed yet.
	useEffect(() => {
		if (started.current || !token || status !== 'online') return;
		started.current = true;
		authActions.verifyEmail(token).then(
			(email) => setState({ kind: 'done', email }),
			(e: unknown) => setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
		);
	}, [token, status]);

	return (
		<section class="auth-page" aria-labelledby="verify-email-title" aria-busy={state.kind === 'working'}>
			<h2 class="auth-page__title" id="verify-email-title">
				{state.kind === 'done' ? 'Email verified' : state.kind === 'error' ? 'Could not verify' : 'Verifying…'}
			</h2>
			{state.kind === 'working' &&
				(status === 'online' || serverConnector.checking.value || serverConnector.lastCheckedAt.value === null ? (
					<Spinner />
				) : (
					<p class="auth-page__text">{status === 'unconfigured' ? 'Connect to the server in Settings → Server, then open the link again.' : 'The server is unreachable. Open the link again when it is back.'}</p>
				))}
			{state.kind === 'done' && (
				<p class="auth-page__text" role="status">
					{state.email} is verified. Password reset links can go there now.
				</p>
			)}
			{state.kind === 'error' && (
				<p class="auth-page__text" role="alert">
					{state.message}
				</p>
			)}
			{state.kind !== 'working' && (
				<div class="auth-page__actions">
					<Button variant="secondary" onClick={() => route('/profile')}>
						Go to profile
					</Button>
				</div>
			)}
		</section>
	);
}

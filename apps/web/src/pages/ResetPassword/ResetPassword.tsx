// /reset-password?token=… — the page a password reset email links to. Sets a new password with
// the single-use token (authActions.resetPassword), which also signs the user in, then goes to
// Settings → Server. Works without a signed-in session; needs the server (the token is checked there).
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { PASSWORD_MIN_LENGTH } from '@chess/core/protocol';
import { Button, Input } from '@/components/common';
import { toast } from '@/services/toast';
import { authActions } from '@/state/auth';
import { accountSwitching } from '@/state/account';
import './ResetPassword.scss';

const SERVER_SETTINGS = '/settings/server';

export default function ResetPassword(): JSX.Element {
	const { query, route } = useLocation();
	const token = (query.token ?? '').trim();
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const short = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
	const mismatch = confirm.length > 0 && confirm !== password;
	const ready = password.length >= PASSWORD_MIN_LENGTH && confirm === password;

	if (!token) {
		return (
			<section class="reset-password" aria-labelledby="reset-password-title">
				<h2 class="reset-password__title" id="reset-password-title">
					Reset password
				</h2>
				<p class="reset-password__text" role="alert">
					This link has no reset code. Open the link from the email again, or request a new one.
				</p>
				<Button variant="secondary" onClick={() => route(SERVER_SETTINGS)}>
					Go to sign in
				</Button>
			</section>
		);
	}

	return (
		<section class="reset-password" aria-labelledby="reset-password-title">
			<h2 class="reset-password__title" id="reset-password-title">
				Set a new password
			</h2>
			<p class="reset-password__text">The link works once and for 1 hour. Other devices are signed out after the change.</p>
			<form
				class="reset-password__form"
				onSubmit={(e) => {
					e.preventDefault();
					if (!ready) return;
					setBusy(true);
					setError(null);
					authActions
						.resetPassword(token, password)
						.then(
							() => {
								// Signing in moved to the account's own database: the app is reloading there (toast follows).
								if (accountSwitching.value) return;
								toast.success('Password changed — you are signed in');
								route(SERVER_SETTINGS, true);
							},
							(err: unknown) => setError(err instanceof Error ? err.message : String(err)),
						)
						.finally(() => setBusy(false));
				}}
			>
				<Input
					label="New password"
					type="password"
					autoComplete="new-password"
					value={password}
					disabled={busy}
					error={short ? `Use at least ${PASSWORD_MIN_LENGTH} characters.` : undefined}
					hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
					onInput={(e) => {
						setPassword(e.currentTarget.value);
						setError(null);
					}}
				/>
				<Input
					label="Confirm new password"
					type="password"
					autoComplete="new-password"
					value={confirm}
					disabled={busy}
					error={mismatch ? 'The passwords do not match.' : undefined}
					onInput={(e) => {
						setConfirm(e.currentTarget.value);
						setError(null);
					}}
				/>
				{error && (
					<p class="reset-password__error" role="alert">
						{error}
					</p>
				)}
				<div class="reset-password__actions">
					<Button type="submit" variant="primary" loading={busy} disabled={!ready}>
						Set password
					</Button>
					<Button variant="ghost" onClick={() => route(SERVER_SETTINGS)}>
						Cancel
					</Button>
				</div>
			</form>
		</section>
	);
}

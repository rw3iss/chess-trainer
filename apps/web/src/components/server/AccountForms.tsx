// Account forms for the Server settings section: forgot password (signed out), email and
// change password (signed in). Each form owns its draft state; errors are user-facing
// messages from the auth store (authActions.* reject with readable Error messages).
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { PASSWORD_MIN_LENGTH } from '@chess/core/protocol';
import { Button, Input } from '@/components/common';
import { toast } from '@/services/toast';
import { authActions, authUser } from '@/state/auth';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const RESET_SENT_TEXT = 'If that account has an email address, a reset link is on its way. It works for 1 hour.';

/** Signed out: request a password reset email by username or email. */
export function ForgotPasswordForm({ disabled, initial = '', onClose }: { disabled?: boolean; initial?: string; onClose: () => void }): JSX.Element {
	const [identifier, setIdentifier] = useState(initial);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sent, setSent] = useState(false);

	return (
		<form
			class="server-settings__subform"
			aria-label="Reset password"
			onSubmit={(e) => {
				e.preventDefault();
				setBusy(true);
				setError(null);
				authActions
					.forgotPassword(identifier)
					.then(() => setSent(true), (err: unknown) => setError(message(err)))
					.finally(() => setBusy(false));
			}}
		>
			<p class="server-settings__text">Enter your username or the email on your account. We email you a link to set a new password.</p>
			<Input
				label="Username or email"
				icon="user"
				autoComplete="username"
				autoCapitalize="none"
				spellcheck={false}
				value={identifier}
				disabled={disabled || busy}
				error={error ?? undefined}
				onInput={(e) => {
					setIdentifier(e.currentTarget.value);
					setError(null);
					setSent(false);
				}}
			/>
			{sent && (
				<p class="server-settings__notice" role="status">
					{RESET_SENT_TEXT}
				</p>
			)}
			<div class="server-settings__actions">
				<Button type="submit" variant="primary" size="sm" loading={busy} disabled={disabled || !identifier.trim()}>
					Send reset link
				</Button>
				<Button variant="ghost" size="sm" onClick={onClose}>
					Back to sign in
				</Button>
			</div>
		</form>
	);
}

/** Signed in: the account email (used for reset links). */
export function AccountEmailForm(): JSX.Element {
	const saved = authUser.value?.email ?? '';
	const [email, setEmail] = useState(saved);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => setEmail(saved), [saved]);
	const dirty = email.trim() !== saved;

	return (
		<form
			class="server-settings__inline-form"
			aria-label="Account email"
			onSubmit={(e) => {
				e.preventDefault();
				if (!dirty) return;
				setBusy(true);
				setError(null);
				authActions
					.updateEmail(email)
					.then((u) => toast.success(u.email ? 'Email saved' : 'Email removed'), (err: unknown) => setError(message(err)))
					.finally(() => setBusy(false));
			}}
		>
			<Input
				label="Email"
				type="email"
				autoComplete="email"
				spellcheck={false}
				placeholder="you@example.com"
				value={email}
				disabled={busy}
				error={error ?? undefined}
				hint={error ? undefined : 'Used only for password reset links.'}
				onInput={(e) => {
					setEmail(e.currentTarget.value);
					setError(null);
				}}
			/>
			<Button type="submit" variant="secondary" loading={busy} disabled={!dirty} class="server-settings__check">
				Save
			</Button>
		</form>
	);
}

/** Signed in: change the password (current + new + confirm). */
export function ChangePasswordForm({ onDone }: { onDone: () => void }): JSX.Element {
	const [current, setCurrent] = useState('');
	const [next, setNext] = useState('');
	const [confirm, setConfirm] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const short = next.length > 0 && next.length < PASSWORD_MIN_LENGTH;
	const mismatch = confirm.length > 0 && confirm !== next;
	const ready = !!current && next.length >= PASSWORD_MIN_LENGTH && confirm === next;

	return (
		<form
			class="server-settings__subform"
			aria-label="Change password"
			onSubmit={(e) => {
				e.preventDefault();
				if (!ready) return;
				setBusy(true);
				setError(null);
				authActions
					.changePassword(current, next)
					.then(
						() => {
							toast.success('Password changed. Other devices are signed out.');
							onDone();
						},
						(err: unknown) => setError(message(err)),
					)
					.finally(() => setBusy(false));
			}}
		>
			<Input
				label="Current password"
				type="password"
				autoComplete="current-password"
				value={current}
				disabled={busy}
				error={error ?? undefined}
				onInput={(e) => {
					setCurrent(e.currentTarget.value);
					setError(null);
				}}
			/>
			<Input
				label="New password"
				type="password"
				autoComplete="new-password"
				value={next}
				disabled={busy}
				error={short ? `Use at least ${PASSWORD_MIN_LENGTH} characters.` : undefined}
				hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
				onInput={(e) => setNext(e.currentTarget.value)}
			/>
			<Input
				label="Confirm new password"
				type="password"
				autoComplete="new-password"
				value={confirm}
				disabled={busy}
				error={mismatch ? 'The passwords do not match.' : undefined}
				onInput={(e) => setConfirm(e.currentTarget.value)}
			/>
			<div class="server-settings__actions">
				<Button type="submit" variant="primary" size="sm" loading={busy} disabled={!ready}>
					Change password
				</Button>
				<Button variant="ghost" size="sm" onClick={onDone}>
					Cancel
				</Button>
			</div>
		</form>
	);
}

// Account forms (profile page + sign-in panel): forgot password (email link), reset with a recovery code,
// display name, email (+ verification state), change / set password. Each form owns its draft state; errors
// are user-facing messages from the auth store (authActions.* reject with readable Error messages).
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { PASSWORD_MIN_LENGTH } from '@chess/core/protocol';
import { Badge, Button, Input } from '@/components/common';
import { toast } from '@/services/toast';
import { authActions, authUser } from '@/state/auth';
import './account.scss';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const RESET_SENT_TEXT = 'If that account has a verified email address, a reset link is on its way. It works for 1 hour.';

/** Signed out: request a password reset email by username or email. */
export function ForgotPasswordForm({ disabled, initial = '', onClose }: { disabled?: boolean; initial?: string; onClose: () => void }): JSX.Element {
	const [identifier, setIdentifier] = useState(initial);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sent, setSent] = useState(false);

	return (
		<form
			class="account-form"
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
			<p class="account-text">Enter your username or the email on your account. We email you a link to set a new password.</p>
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
				<p class="account-notice" role="status">
					{RESET_SENT_TEXT}
				</p>
			)}
			<div class="account-form__actions">
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

/** Signed out: set a new password with a recovery code (no email needed) → signed in. */
export function RecoverWithCodeForm({ disabled, initial = '', onClose }: { disabled?: boolean; initial?: string; onClose: () => void }): JSX.Element {
	const [username, setUsername] = useState(initial);
	const [code, setCode] = useState('');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const short = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
	const mismatch = confirm.length > 0 && confirm !== password;
	const ready = !!username.trim() && !!code.trim() && password.length >= PASSWORD_MIN_LENGTH && confirm === password;

	return (
		<form
			class="account-form"
			aria-label="Use a recovery code"
			onSubmit={(e) => {
				e.preventDefault();
				if (!ready) return;
				setBusy(true);
				setError(null);
				authActions
					.recoverPassword(username, code, password)
					.then(() => toast.success('Password changed — you are signed in'), (err: unknown) => setError(message(err)))
					.finally(() => setBusy(false));
			}}
		>
			<p class="account-text">Each recovery code works once. You saved them when you made them on your profile.</p>
			<Input label="Username" icon="user" autoComplete="username" autoCapitalize="none" spellcheck={false} value={username} disabled={disabled || busy} onInput={(e) => setUsername(e.currentTarget.value)} />
			<Input
				label="Recovery code"
				autoComplete="one-time-code"
				autoCapitalize="none"
				spellcheck={false}
				value={code}
				disabled={disabled || busy}
				onInput={(e) => {
					setCode(e.currentTarget.value);
					setError(null);
				}}
			/>
			<Input
				label="New password"
				type="password"
				autoComplete="new-password"
				value={password}
				disabled={disabled || busy}
				error={short ? `Use at least ${PASSWORD_MIN_LENGTH} characters.` : undefined}
				hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
				onInput={(e) => setPassword(e.currentTarget.value)}
			/>
			<Input
				label="Confirm new password"
				type="password"
				autoComplete="new-password"
				value={confirm}
				disabled={disabled || busy}
				error={mismatch ? 'The passwords do not match.' : undefined}
				onInput={(e) => setConfirm(e.currentTarget.value)}
			/>
			{error && (
				<p class="account-error account-error--box" role="alert">
					{error}
				</p>
			)}
			<div class="account-form__actions">
				<Button type="submit" variant="primary" size="sm" loading={busy} disabled={disabled || !ready}>
					Set new password
				</Button>
				<Button variant="ghost" size="sm" onClick={onClose}>
					Back to sign in
				</Button>
			</div>
		</form>
	);
}

/** Signed in: display name. */
export function DisplayNameForm(): JSX.Element {
	const saved = authUser.value?.displayName ?? '';
	const [name, setName] = useState(saved);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => setName(saved), [saved]);
	const dirty = name.trim() !== saved && !!name.trim();

	return (
		<form
			class="account-inline"
			aria-label="Display name"
			onSubmit={(e) => {
				e.preventDefault();
				if (!dirty) return;
				setBusy(true);
				setError(null);
				authActions
					.updateDisplayName(name)
					.then(() => toast.success('Name saved'), (err: unknown) => setError(message(err)))
					.finally(() => setBusy(false));
			}}
		>
			<Input
				label="Display name"
				maxLength={64}
				value={name}
				disabled={busy}
				error={error ?? undefined}
				hint={error ? undefined : 'Shown to other players and in invites.'}
				onInput={(e) => {
					setName(e.currentTarget.value);
					setError(null);
				}}
			/>
			<Button type="submit" variant="secondary" loading={busy} disabled={!dirty} class="account-inline__btn">
				Save
			</Button>
		</form>
	);
}

/** Signed in: the account email (reset links go to verified emails only) + its verification state. */
export function AccountEmailForm(): JSX.Element {
	const user = authUser.value;
	const saved = user?.email ?? '';
	const verified = user?.emailVerified === true;
	const [email, setEmail] = useState(saved);
	const [busy, setBusy] = useState(false);
	const [resending, setResending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => setEmail(saved), [saved]);
	const dirty = email.trim() !== saved;

	return (
		<div class="account-form">
			<form
				class="account-inline"
				aria-label="Account email"
				onSubmit={(e) => {
					e.preventDefault();
					if (!dirty) return;
					setBusy(true);
					setError(null);
					authActions
						.updateEmail(email)
						.then((u) => toast.success(u.email ? `Check ${u.email} for a link to verify it` : 'Email removed'), (err: unknown) => setError(message(err)))
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
					hint={error ? undefined : 'For password reset links. Never shown to other players.'}
					onInput={(e) => {
						setEmail(e.currentTarget.value);
						setError(null);
					}}
				/>
				<Button type="submit" variant="secondary" loading={busy} disabled={!dirty} class="account-inline__btn">
					Save
				</Button>
			</form>
			{saved && !dirty && (
				<div class="account-verify" role="status">
					{verified ? (
						<Badge tone="success">Verified</Badge>
					) : (
						<>
							<Badge tone="warn">Not verified</Badge>
							<span class="account-text">Open the link we emailed to {saved}.</span>
							<Button
								variant="ghost"
								size="sm"
								loading={resending}
								onClick={() => {
									setResending(true);
									setError(null);
									authActions
										.resendVerification()
										.then(() => toast.success(`Link sent to ${saved}`), (err: unknown) => setError(message(err)))
										.finally(() => setResending(false));
								}}
							>
								Resend link
							</Button>
						</>
					)}
				</div>
			)}
		</div>
	);
}

/** Signed in: change the password (current + new + confirm). `setOnly`: no password yet (provider sign-in) → no current field. */
export function ChangePasswordForm({ onDone, setOnly = false }: { onDone: () => void; setOnly?: boolean }): JSX.Element {
	const [current, setCurrent] = useState('');
	const [next, setNext] = useState('');
	const [confirm, setConfirm] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const short = next.length > 0 && next.length < PASSWORD_MIN_LENGTH;
	const mismatch = confirm.length > 0 && confirm !== next;
	const ready = (setOnly || !!current) && next.length >= PASSWORD_MIN_LENGTH && confirm === next;

	return (
		<form
			class="account-form"
			aria-label={setOnly ? 'Set password' : 'Change password'}
			onSubmit={(e) => {
				e.preventDefault();
				if (!ready) return;
				setBusy(true);
				setError(null);
				authActions
					.changePassword(setOnly ? '' : current, next)
					.then(
						() => {
							toast.success(setOnly ? 'Password set. You can now sign in with it.' : 'Password changed. Other devices are signed out.');
							onDone();
						},
						(err: unknown) => setError(message(err)),
					)
					.finally(() => setBusy(false));
			}}
		>
			{setOnly ? (
				error && (
					<p class="account-error account-error--box" role="alert">
						{error}
					</p>
				)
			) : (
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
			)}
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
			<div class="account-form__actions">
				<Button type="submit" variant="primary" size="sm" loading={busy} disabled={!ready}>
					{setOnly ? 'Set password' : 'Change password'}
				</Button>
				<Button variant="ghost" size="sm" onClick={onDone}>
					Cancel
				</Button>
			</div>
		</form>
	);
}

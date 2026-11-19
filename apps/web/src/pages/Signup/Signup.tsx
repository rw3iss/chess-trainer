// /signup[?invite=…] — create an account (POST /auth/register), or continue with Google.
// Sign-up mode comes from /health (features.signup): 'open', 'invite' (needs an invite code), 'off'.
// An invite link shows who sent it and pre-fills the email. After sign-up the app moves to the new
// account's own local database (state/account.ts) and opens the board.
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { PASSWORD_MIN_LENGTH, USERNAME_RE, type InvitePreview } from '@chess/core/protocol';
import { Button, Input } from '@/components/common';
import { ProviderButtons } from '@/components/account';
import { serverConnector } from '@/services/server';
import { toast } from '@/services/toast';
import { accountSwitching } from '@/state/account';
import { authActions, authBusy, isLoggedIn } from '@/state/auth';
import './Signup.scss';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function Signup(): JSX.Element {
	const { query, route } = useLocation();
	const invite = (query.invite ?? '').trim();
	const online = serverConnector.status.value === 'online';
	const mode = online ? (serverConnector.health.value?.features?.signup ?? 'off') : null;
	const [preview, setPreview] = useState<InvitePreview | null>(null);
	const [inviteError, setInviteError] = useState<string | null>(null);
	const [username, setUsername] = useState('');
	const [displayName, setDisplayName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [error, setError] = useState<string | null>(null);
	const busy = authBusy.value;

	useEffect(() => {
		if (!invite || !online) return;
		let live = true;
		authActions.invitePreview(invite).then(
			(p) => {
				if (!live) return;
				setPreview(p);
				if (p.email) setEmail((cur) => cur || p.email);
			},
			(e: unknown) => live && setInviteError(message(e)),
		);
		return () => {
			live = false;
		};
	}, [invite, online]);

	const name = username.trim().toLowerCase();
	const badName = name.length > 0 && !USERNAME_RE.test(name);
	const short = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
	const mismatch = confirm.length > 0 && confirm !== password;
	const ready = USERNAME_RE.test(name) && password.length >= PASSWORD_MIN_LENGTH && confirm === password;

	const header = (
		<>
			<h2 class="auth-page__title" id="signup-title">
				Create an account
			</h2>
			{preview && (
				<p class="auth-page__invite" role="status">
					Invited by <strong>{preview.inviter.displayName}</strong> (@{preview.inviter.username}).
				</p>
			)}
			{inviteError && (
				<p class="auth-page__error" role="alert">
					{inviteError}
				</p>
			)}
		</>
	);

	let closed: string | null = null;
	if (isLoggedIn.value) closed = 'You are signed in. Sign out first (account menu) to create another account.';
	else if (mode === null) closed = 'Connect to the server to create an account (Settings → Server).';
	else if (mode === 'off') closed = 'Sign-up is closed on this server.';
	else if (mode === 'invite' && !invite) closed = 'This server needs an invite. Ask a member to send you an invite link.';
	if (closed) {
		return (
			<section class="auth-page" aria-labelledby="signup-title">
				{header}
				<p class="auth-page__text" role="alert">
					{closed}
				</p>
				<div class="auth-page__actions">
					<Button variant="secondary" onClick={() => route(mode === null ? '/settings/server' : '/profile')}>
						Go to sign in
					</Button>
				</div>
			</section>
		);
	}

	return (
		<section class="auth-page" aria-labelledby="signup-title">
			{header}
			<p class="auth-page__text">Your games and sessions sync to your account. This device keeps a copy for offline use.</p>
			<ProviderButtons mode="signin" returnTo="/" invite={invite || undefined} />
			<form
				class="auth-page__form"
				aria-label="Create an account"
				onSubmit={(e) => {
					e.preventDefault();
					if (!ready) return;
					setError(null);
					authActions
						.register({ username: name, password, displayName, email, invite: invite || undefined })
						.then(
							(u) => {
								if (accountSwitching.value) return;
								toast.success(`Welcome, ${u.displayName}`);
								route('/', true);
							},
							(err: unknown) => setError(message(err)),
						);
				}}
			>
				<Input
					label="Username"
					icon="user"
					autoComplete="username"
					autoCapitalize="none"
					spellcheck={false}
					value={username}
					disabled={busy}
					error={badName ? '3–24 characters: letters, digits, _ or -.' : undefined}
					hint="Lower-case letters, digits, _ or -."
					onInput={(e) => {
						setUsername(e.currentTarget.value);
						setError(null);
					}}
				/>
				<Input label="Display name (optional)" autoComplete="nickname" value={displayName} disabled={busy} maxLength={64} onInput={(e) => setDisplayName(e.currentTarget.value)} />
				<Input
					label="Email (optional)"
					type="email"
					autoComplete="email"
					spellcheck={false}
					value={email}
					disabled={busy}
					hint="Only for password reset links."
					onInput={(e) => setEmail(e.currentTarget.value)}
				/>
				<Input
					label="Password"
					type="password"
					autoComplete="new-password"
					value={password}
					disabled={busy}
					error={short ? `Use at least ${PASSWORD_MIN_LENGTH} characters.` : undefined}
					hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
					onInput={(e) => setPassword(e.currentTarget.value)}
				/>
				<Input
					label="Confirm password"
					type="password"
					autoComplete="new-password"
					value={confirm}
					disabled={busy}
					error={mismatch ? 'The passwords do not match.' : undefined}
					onInput={(e) => setConfirm(e.currentTarget.value)}
				/>
				{error && (
					<p class="auth-page__error" role="alert">
						{error}
					</p>
				)}
				<div class="auth-page__actions">
					<Button type="submit" variant="primary" loading={busy} disabled={!ready}>
						Create account
					</Button>
					<Button variant="ghost" onClick={() => route('/profile')}>
						I have an account
					</Button>
				</div>
				<p class="auth-page__fine">
					See how your data is used in the{' '}
					<a href="/privacy.html" target="_blank" rel="noopener">
						privacy policy
					</a>
					.
				</p>
			</form>
		</section>
	);
}

// Signed-out account panel (Profile page): Google / Lichess, username + password, forgot password
// (email link when the server can send email; recovery code always), create account.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button, Input } from '@/components/common';
import { serverConnector } from '@/services/server';
import { accountActions, activeAccount } from '@/state/account';
import { authActions, authBusy, authError } from '@/state/auth';
import { ForgotPasswordForm, RecoverWithCodeForm } from './AccountForms';
import { ProviderButtons } from './ProviderButtons';
import './account.scss';

type View = 'signin' | 'email' | 'code';

export function SignInPanel({ returnTo = '/profile' }: { returnTo?: string }): JSX.Element {
	const online = serverConnector.status.value === 'online';
	const configured = serverConnector.status.value !== 'unconfigured';
	const health = serverConnector.health.value;
	const authFeature = health?.features.auth ?? true;
	const canEmailReset = health?.features?.passwordReset === true;
	const signupMode = online ? (health?.features?.signup ?? 'off') : 'off';
	const busy = authBusy.value;
	const error = authError.value;
	const offlineAccount = activeAccount.value;
	const { route } = useLocation();
	const [view, setView] = useState<View>('signin');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const disabled = !online || !authFeature;

	if (view === 'email' && online) return <ForgotPasswordForm disabled={disabled} initial={username} onClose={() => setView('signin')} />;
	if (view === 'code' && online) return <RecoverWithCodeForm disabled={disabled} initial={username.includes('@') ? '' : username} onClose={() => setView('signin')} />;

	return (
		<div class="sign-in-panel">
			{offlineAccount && (
				<p class="account-notice" role="status">
					Signed out of {offlineAccount.displayName}. Its games stay on this device: sign in again to sync, or{' '}
					<button type="button" class="account-linkbtn" onClick={() => void accountActions.switchTo(null)}>
						switch to anonymous
					</button>
					.
				</p>
			)}
			<p class="account-text">
				{!configured ? (
					<>
						Connect to a server in{' '}
						<button type="button" class="account-linkbtn" onClick={() => route('/settings/server')}>
							Settings → Server
						</button>{' '}
						to sign in. Without one, everything stays on this device.
					</>
				) : !online ? (
					'The server is unreachable. Your data stays on this device; sign in when it is back.'
				) : !authFeature ? (
					'This server does not offer accounts.'
				) : (
					'Sign in to sync your games and sessions between devices.'
				)}
			</p>
			{online && authFeature && <ProviderButtons mode="signin" returnTo={returnTo} />}
			<form
				class="sign-in-panel__form"
				aria-label="Sign in"
				onSubmit={(e) => {
					e.preventDefault();
					if (!username.trim() || !password) return;
					void authActions.login(username, password).then(
						() => setPassword(''),
						() => undefined,
					);
				}}
			>
				<Input
					label="Username or email"
					icon="user"
					autoComplete="username"
					autoCapitalize="none"
					spellcheck={false}
					value={username}
					disabled={disabled}
					onInput={(e) => {
						setUsername(e.currentTarget.value);
						if (error) authActions.clearError();
					}}
				/>
				<Input
					label="Password"
					type="password"
					autoComplete="current-password"
					value={password}
					disabled={disabled}
					error={error ?? undefined}
					onInput={(e) => {
						setPassword(e.currentTarget.value);
						if (error) authActions.clearError();
					}}
				/>
				<div class="sign-in-panel__submit account-form__actions">
					<Button type="submit" variant="primary" loading={busy} disabled={disabled || !username.trim() || !password}>
						Sign in
					</Button>
					{online && authFeature && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								authActions.clearError();
								setView(canEmailReset ? 'email' : 'code');
							}}
						>
							Forgot password?
						</Button>
					)}
					{online && authFeature && canEmailReset && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								authActions.clearError();
								setView('code');
							}}
						>
							Use a recovery code
						</Button>
					)}
					{signupMode !== 'off' && (
						<Button variant="ghost" size="sm" disabled={disabled} onClick={() => route('/signup')}>
							Create account
						</Button>
					)}
				</div>
			</form>
		</div>
	);
}

// Profile → Security: recovery codes (reset the password without email). New codes are shown once
// (copy / download); making new ones invalidates the old ones.
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Button, Input } from '@/components/common';
import { downloadText } from '@/services/pgn/pgnExport';
import { toast } from '@/services/toast';
import { authActions, authUser } from '@/state/auth';
import './account.scss';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function recoveryCodesText(username: string, codes: readonly string[], appName = 'Chess Trainer'): string {
	return [`${appName} recovery codes for @${username}`, 'Each code works once. Keep them somewhere safe.', '', ...codes, ''].join('\n');
}

export function RecoveryCodes(): JSX.Element | null {
	const user = authUser.value;
	const [remaining, setRemaining] = useState<number | null>(null);
	const [codes, setCodes] = useState<string[] | null>(null);
	const [asking, setAsking] = useState(false);
	const [password, setPassword] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const noPassword = user?.hasPassword === false;

	useEffect(() => {
		authActions.recoveryCodesLeft().then(setRemaining, () => setRemaining(null));
	}, [user?.id]);

	if (!user) return null;

	const generate = () => {
		setBusy(true);
		setError(null);
		authActions
			.createRecoveryCodes(noPassword ? '' : password)
			.then((c) => {
				setCodes(c);
				setRemaining(c.length);
				setAsking(false);
				setPassword('');
			}, (e: unknown) => setError(message(e)))
			.finally(() => setBusy(false));
	};

	return (
		<section class="account-block" aria-labelledby="account-recovery">
			<h4 class="account-block__title" id="account-recovery">
				Recovery codes
			</h4>
			<p class="account-text">
				Reset your password without email: each code works once.{' '}
				{remaining !== null && (remaining > 0 ? `${remaining} unused ${remaining === 1 ? 'code' : 'codes'} left.` : 'You have no codes yet.')}
			</p>
			{codes && (
				<div class="recovery-codes" role="status">
					<p class="account-notice">Save these now. They are not shown again.</p>
					<ol class="recovery-codes__list" aria-label="Recovery codes">
						{codes.map((c) => (
							<li key={c}>
								<code>{c}</code>
							</li>
						))}
					</ol>
					<div class="account-form__actions">
						<Button
							variant="secondary"
							size="sm"
							icon="copy"
							onClick={() =>
								navigator.clipboard.writeText(codes.join('\n')).then(
									() => toast.success('Codes copied'),
									() => toast.error('Copy failed — select the codes and copy them.'),
								)
							}
						>
							Copy
						</Button>
						<Button variant="secondary" size="sm" icon="download" onClick={() => downloadText(`chess-recovery-codes-${user.username}.txt`, recoveryCodesText(user.username, codes), 'text/plain')}>
							Download .txt
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setCodes(null)}>
							Done
						</Button>
					</div>
				</div>
			)}
			{!codes &&
				(asking ? (
					<form
						class="account-form"
						aria-label="New recovery codes"
						onSubmit={(e) => {
							e.preventDefault();
							generate();
						}}
					>
						{remaining ? <p class="account-text">Your {remaining} old codes stop working.</p> : null}
						{!noPassword && (
							<Input
								label="Current password"
								type="password"
								autoComplete="current-password"
								value={password}
								disabled={busy}
								error={error ?? undefined}
								onInput={(e) => {
									setPassword(e.currentTarget.value);
									setError(null);
								}}
							/>
						)}
						{noPassword && error && (
							<p class="account-error" role="alert">
								{error}
							</p>
						)}
						<div class="account-form__actions">
							<Button type="submit" variant="primary" size="sm" loading={busy} disabled={!noPassword && !password}>
								Make 8 new codes
							</Button>
							<Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
								Cancel
							</Button>
						</div>
					</form>
				) : (
					<div class="account-form__actions">
						<Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
							{remaining ? 'Make new codes' : 'Make recovery codes'}
						</Button>
					</div>
				))}
		</section>
	);
}

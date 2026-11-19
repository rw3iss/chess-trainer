// Profile → Owner tools (role owner only): a one-time password reset link for another user, to pass on
// by any channel (no email needed).
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { OwnerResetLinkDto } from '@chess/core/protocol';
import { Button, Input } from '@/components/common';
import { toast } from '@/services/toast';
import { authActions, authUser } from '@/state/auth';
import { absoluteLink } from './InviteFriend';
import './account.scss';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function OwnerTools(): JSX.Element | null {
	const user = authUser.value;
	const [username, setUsername] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<(OwnerResetLinkDto & { username: string }) | null>(null);
	if (user?.role !== 'owner') return null;
	const link = result ? absoluteLink(result.link) : '';

	return (
		<section class="account-block" aria-labelledby="account-owner">
			<h4 class="account-block__title" id="account-owner">
				Reset link for a user
			</h4>
			<p class="account-text">For a user who lost their password and email. The link works once, for 1 hour.</p>
			<form
				class="account-inline"
				aria-label="Reset link for a user"
				onSubmit={(e) => {
					e.preventDefault();
					setBusy(true);
					setError(null);
					authActions
						.ownerResetLink(username)
						.then((r) => setResult({ ...r, username: username.trim() }), (err: unknown) => setError(message(err)))
						.finally(() => setBusy(false));
				}}
			>
				<Input
					label="Username"
					icon="user"
					autoCapitalize="none"
					spellcheck={false}
					value={username}
					disabled={busy}
					error={error ?? undefined}
					onInput={(e) => {
						setUsername(e.currentTarget.value);
						setError(null);
					}}
				/>
				<Button type="submit" variant="secondary" loading={busy} disabled={!username.trim()} class="account-inline__btn">
					Make link
				</Button>
			</form>
			{result && (
				<div class="account-link" role="status">
					<span class="account-link__text">{link}</span>
					<Button
						variant="ghost"
						size="sm"
						icon="copy"
						aria-label={`Copy reset link for ${result.username}`}
						onClick={() =>
							navigator.clipboard.writeText(link).then(
								() => toast.success('Link copied'),
								() => toast.error('Copy failed — select the link and copy it.'),
							)
						}
					/>
				</div>
			)}
		</section>
	);
}

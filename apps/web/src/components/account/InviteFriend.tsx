// Profile → Invites: invite a friend by email (the server emails a sign-up link; the link is shown to copy too).
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { InviteDto } from '@chess/core/protocol';
import { Button, Input } from '@/components/common';
import { toast } from '@/services/toast';
import { authActions } from '@/state/auth';
import './account.scss';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Absolute invite link (the server may return a path). */
export function absoluteLink(link: string): string {
	try {
		return new URL(link, window.location.origin).href;
	} catch {
		return link;
	}
}

async function copy(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		toast.success('Link copied');
	} catch {
		toast.error('Copy failed — select the link and copy it.');
	}
}

export function InviteFriend(): JSX.Element {
	const [email, setEmail] = useState('');
	const [note, setNote] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [last, setLast] = useState<InviteDto | null>(null);
	const [sent, setSent] = useState<InviteDto[]>([]);

	useEffect(() => {
		authActions.invites().then(setSent, () => undefined);
	}, []);

	return (
		<section class="account-block" aria-labelledby="account-invite">
			<h4 class="account-block__title" id="account-invite">
				Invite a friend
			</h4>
			<form
				class="account-form"
				aria-label="Invite a friend"
				onSubmit={(e) => {
					e.preventDefault();
					setBusy(true);
					setError(null);
					authActions
						.createInvite(email, note)
						.then((inv) => {
							setLast(inv);
							setSent((l) => [inv, ...l.filter((x) => x.code !== inv.code)]);
							setEmail('');
							setNote('');
							toast.success(`Invite sent to ${inv.email}`);
						}, (err: unknown) => setError(message(err)))
						.finally(() => setBusy(false));
				}}
			>
				<Input
					label="Friend's email"
					type="email"
					autoComplete="off"
					spellcheck={false}
					value={email}
					disabled={busy}
					error={error ?? undefined}
					onInput={(e) => {
						setEmail(e.currentTarget.value);
						setError(null);
					}}
				/>
				<Input label="Message (optional)" value={note} disabled={busy} maxLength={500} onInput={(e) => setNote(e.currentTarget.value)} />
				<div class="account-form__actions">
					<Button type="submit" variant="primary" size="sm" icon="share" loading={busy} disabled={!email.trim()}>
						Send invite
					</Button>
				</div>
			</form>
			{last && (
				<div class="account-link" role="status">
					<span class="account-link__text">{absoluteLink(last.link)}</span>
					<Button variant="ghost" size="sm" icon="copy" onClick={() => void copy(absoluteLink(last.link))}>
						Copy link
					</Button>
				</div>
			)}
			{sent.length > 0 && (
				<ul class="account-list" aria-label="Sent invites">
					{sent.map((i) => (
						<li key={i.code} class="account-list__row">
							<span class="account-list__main">
								<span class="account-list__name">{i.email}</span>
								<span class="account-list__sub">{i.acceptedAt ? 'Joined' : `Sent ${new Date(i.createdAt).toLocaleDateString()}`}</span>
							</span>
							{!i.acceptedAt && (
								<Button variant="ghost" size="sm" icon="copy" onClick={() => void copy(absoluteLink(i.link))}>
									Copy link
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

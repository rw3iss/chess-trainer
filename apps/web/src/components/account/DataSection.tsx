// Profile → Data: export (PGN + JSON backup), remove this account from the device, delete the account.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button, Input } from '@/components/common';
import { toast } from '@/services/toast';
import { authActions, authUser } from '@/state/auth';
import { exportBackupJson, exportGamesPgn } from './accountData';
import { RemoveFromDevice } from './RemoveFromDevice';
import './account.scss';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ExportData(): JSX.Element {
	const user = authUser.value;
	const account = user ? { username: user.username, displayName: user.displayName } : null;
	const [busy, setBusy] = useState<'pgn' | 'json' | null>(null);
	return (
		<section class="account-block" aria-labelledby="account-export">
			<h4 class="account-block__title" id="account-export">
				Export
			</h4>
			<p class="account-text">Download what is stored on this device{user ? ' for this account' : ''}.</p>
			<div class="account-form__actions">
				<Button
					variant="secondary"
					size="sm"
					icon="download"
					loading={busy === 'pgn'}
					onClick={() => {
						setBusy('pgn');
						exportGamesPgn(account)
							.then((n) => (n ? toast.success(`Exported ${n} ${n === 1 ? 'game' : 'games'}`) : toast.info('No saved games yet')), (e: unknown) => toast.error(message(e)))
							.finally(() => setBusy(null));
					}}
				>
					Saved games (PGN)
				</Button>
				<Button
					variant="secondary"
					size="sm"
					icon="download"
					loading={busy === 'json'}
					onClick={() => {
						setBusy('json');
						exportBackupJson(account)
							.then(() => toast.success('Backup downloaded'), (e: unknown) => toast.error(message(e)))
							.finally(() => setBusy(null));
					}}
				>
					Everything (JSON)
				</Button>
			</div>
		</section>
	);
}

export function DeleteAccount(): JSX.Element | null {
	const user = authUser.value;
	const [open, setOpen] = useState(false);
	const [password, setPassword] = useState('');
	const [confirmName, setConfirmName] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	if (!user || user.role === 'owner') return null;
	const noPassword = user.hasPassword === false;
	const ready = confirmName.trim().toLowerCase() === user.username && (noPassword || !!password);

	return (
		<section class="account-block account-block--danger" aria-labelledby="account-delete">
			<h4 class="account-block__title" id="account-delete">
				Delete account
			</h4>
			<p class="account-text">Deletes the account and everything synced to the server. This cannot be undone. Export first if you want a copy.</p>
			{open ? (
				<form
					class="account-form"
					aria-label="Delete account"
					onSubmit={(e) => {
						e.preventDefault();
						if (!ready) return;
						setBusy(true);
						setError(null);
						authActions
							.deleteAccount(noPassword ? '' : password)
							.then(() => toast.success('Account deleted'), (err: unknown) => setError(message(err)))
							.finally(() => setBusy(false));
					}}
				>
					<Input
						label={`Type your username (${user.username}) to confirm`}
						autoComplete="off"
						autoCapitalize="none"
						spellcheck={false}
						value={confirmName}
						disabled={busy}
						onInput={(e) => setConfirmName(e.currentTarget.value)}
					/>
					{!noPassword && (
						<Input
							label="Password"
							type="password"
							autoComplete="current-password"
							value={password}
							disabled={busy}
							onInput={(e) => {
								setPassword(e.currentTarget.value);
								setError(null);
							}}
						/>
					)}
					{error && (
						<p class="account-error account-error--box" role="alert">
							{error}
						</p>
					)}
					<div class="account-form__actions">
						<Button type="submit" variant="danger" size="sm" loading={busy} disabled={!ready}>
							Delete my account
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
							Cancel
						</Button>
					</div>
				</form>
			) : (
				<div class="account-form__actions">
					<Button variant="danger" size="sm" onClick={() => setOpen(true)}>
						Delete account…
					</Button>
				</div>
			)}
		</section>
	);
}

export function DataSection(): JSX.Element {
	return (
		<>
			<ExportData />
			{authUser.value && (
				<section class="account-block" aria-labelledby="account-device">
					<h4 class="account-block__title" id="account-device">
						This device
					</h4>
					<p class="account-text">Remove this account's local copy. Synced data stays on the server.</p>
					<div class="account-form__actions">
						<RemoveFromDevice />
					</div>
				</section>
			)}
			<DeleteAccount />
		</>
	);
}

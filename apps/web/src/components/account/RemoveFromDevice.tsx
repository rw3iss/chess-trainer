// Account card: delete this account's local database from the device (two-step confirm).
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '@/components/common';
import { accountActions, activeAccountKey } from '@/state/account';

export function RemoveFromDevice(): JSX.Element | null {
	const key = activeAccountKey.value;
	const [confirm, setConfirm] = useState(false);
	if (!key) return null;
	return confirm ? (
		<div class="account-form__actions" role="group" aria-label="Remove from this device">
			<span class="account-list__sub">Deletes this account's games and sessions on this device (synced copies stay on the server).</span>
			<Button variant="danger" size="sm" onClick={() => void accountActions.removeFromDevice(key)}>
				Remove
			</Button>
			<Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
				Cancel
			</Button>
		</div>
	) : (
		<Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirm(true)}>
			Remove from this device
		</Button>
	);
}

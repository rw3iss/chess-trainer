// One-time prompt after an account's first sign-in on this device: copy the anonymous games and
// sessions into the account's (empty) database? (state/account.ts copyPrompt / answerCopy)
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '@/components/common';
import { Modal } from '@/components/common/Modal';
import { accountActions, copyPrompt } from '@/state/account';

export function CopyDataDialog(): JSX.Element | null {
	const a = copyPrompt.value;
	const [busy, setBusy] = useState(false);
	if (!a) return null;
	return (
		<Modal
			open
			size="sm"
			title={`Copy this device's games and sessions into ${a.displayName}?`}
			description="They are on this device without an account. Copy them into this account to sync them; the anonymous copy stays here too."
			onClose={() => void accountActions.answerCopy(false)}
			footer={
				<>
					<Button variant="ghost" disabled={busy} onClick={() => void accountActions.answerCopy(false)}>
						Not now
					</Button>
					<Button
						variant="primary"
						loading={busy}
						onClick={() => {
							setBusy(true);
							void accountActions.answerCopy(true).finally(() => setBusy(false));
						}}
					>
						Copy
					</Button>
				</>
			}
		>
			<p>You can still switch to "Anonymous" in the account menu to see the device copy.</p>
		</Modal>
	);
}

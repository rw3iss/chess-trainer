// One-time prompt after an account's first sign-in on this device: copy the anonymous games and
// sessions into the account's database? (state/account.ts copyPrompt / answerCopy). Profile → Data can copy again.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from '@/components/common';
import { Modal } from '@/components/common/Modal';
import { accountActions, copyPrompt, deviceData } from '@/state/account';

export function CopyDataDialog(): JSX.Element | null {
	const a = copyPrompt.value;
	const [busy, setBusy] = useState(false);
	if (!a) return null;
	const n = deviceData.value;
	const what = [n.games && `${n.games} saved game${n.games === 1 ? '' : 's'}`, n.sessions && `${n.sessions} session${n.sessions === 1 ? '' : 's'}`].filter(Boolean).join(' and ') || 'Games';
	return (
		<Modal
			open
			size="sm"
			title={`Copy this device's games into ${a.displayName}?`}
			description={`${what} on this device are not in an account yet. Copy them into ${a.displayName} to sync them. They also stay on this device for when you are signed out.`}
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
			<p>You can copy them later too: Profile → Data.</p>
		</Modal>
	);
}

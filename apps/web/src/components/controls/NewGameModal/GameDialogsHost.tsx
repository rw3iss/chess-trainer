// Always-mounted host for the game dialogs (rendered into its own root by install.ts).
import type { JSX } from 'preact';
import { activeSession } from '@/state/sessions';
import { closeGameDialog, gameDialog } from './dialogs';
import { DrawOfferDialog, ResignDialog } from './GameEndDialogs';
import { NewGameModal } from './NewGameModal';

export function GameDialogsHost(): JSX.Element {
	const d = gameDialog.value;
	const session = activeSession.value;
	return (
		<>
			<NewGameModal open={d?.kind === 'new'} mode={d?.kind === 'new' ? d.mode : undefined} onClose={closeGameDialog} />
			<ResignDialog open={d?.kind === 'resign'} session={session} onClose={closeGameDialog} />
			<DrawOfferDialog open={d?.kind === 'draw'} session={session} onClose={closeGameDialog} />
		</>
	);
}

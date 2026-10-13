// Play with Bot (PLAN §4.3): engine, target Elo (presets), your colour, think
// time, optional clock, takebacks. Start attaches the bot to the session from
// its current position; when the session already plays a bot, the modal edits
// it (Update) or detaches it.
import type { JSX } from 'preact';
import type { Session } from '@chess/core/game';
import { Button, Modal } from '@/components/common';
import { botActions, sessionsActions } from '@/state';
import { toSetup } from './botForm';
import { BotSetupFields, useBotSetupForm } from './BotSetupFields';
import './BotModal.scss';

export interface BotModalProps {
	open: boolean;
	onClose: () => void;
	session: Session | null;
}

export function BotModal({ open, onClose, session }: BotModalProps): JSX.Element | null {
	const editing = session?.mode === 'bot' && !!session.bot;
	const { form, set, canStart } = useBotSetupForm(session, open);

	const start = () => {
		if (!canStart) return;
		const target = session ?? sessionsActions.newSession();
		botActions.attach(toSetup(form), target.id);
		onClose();
	};
	const detach = () => {
		if (session) botActions.detach(session.id);
		onClose();
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={editing ? 'Bot game' : 'Play with a bot'}
			description={editing ? 'Change the bot or go back to analysis.' : 'The bot continues from the position on the board.'}
			size="md"
			class="bot-modal"
			footer={
				<div class="bot-modal__footer">
					{editing && (
						<Button variant="ghost" icon="close" onClick={detach} class="bot-modal__detach">
							Detach
						</Button>
					)}
					<span class="bot-modal__spacer" />
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" icon="bot" onClick={start} disabled={!canStart}>
						{editing ? 'Update' : 'Start'}
					</Button>
				</div>
			}
		>
			<BotSetupFields form={form} set={set} />
		</Modal>
	);
}

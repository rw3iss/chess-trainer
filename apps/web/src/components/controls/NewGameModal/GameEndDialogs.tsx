// Local-game end dialogs: resign (pick the side that resigns) and draw offer
// (both players on this device agree). Both set session.result.
import type { JSX } from 'preact';
import type { Color } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import { Button, Modal } from '@/components/common';
import { sessionsActions } from '@/state/sessions';

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');
const NAME: Record<Color, string> = { white: 'White', black: 'Black' };

export function resignSession(session: Session, color: Color): void {
	sessionsActions.update({ result: { winner: other(color), reason: 'resign' } }, session.id);
}

export function agreeDraw(session: Session): void {
	sessionsActions.update({ result: { winner: null, reason: 'draw-agreed' } }, session.id);
}

interface DialogProps {
	open: boolean;
	session: Session | null;
	onClose: () => void;
}

export function ResignDialog({ open, session, onClose }: DialogProps): JSX.Element | null {
	const pick = (c: Color) => {
		if (session) resignSession(session, c);
		onClose();
	};
	return (
		<Modal
			open={open && !!session}
			onClose={onClose}
			title="Resign"
			size="sm"
			class="game-end-dialog"
			footer={
				<Button variant="ghost" onClick={onClose}>
					Keep playing
				</Button>
			}
		>
			<div class="game-end-dialog__body">
				<p class="game-end-dialog__text">Which side resigns? The other side wins the game.</p>
				<div class="game-end-dialog__choices">
					{(['white', 'black'] as const).map((c) => (
						<Button variant="danger" onClick={() => pick(c)}>
							{NAME[c]} resigns
						</Button>
					))}
				</div>
			</div>
		</Modal>
	);
}

export function DrawOfferDialog({ open, session, onClose }: DialogProps): JSX.Element | null {
	const accept = () => {
		if (session) agreeDraw(session);
		onClose();
	};
	return (
		<Modal
			open={open && !!session}
			onClose={onClose}
			title="Offer a draw"
			size="sm"
			class="game-end-dialog"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Decline
					</Button>
					<Button variant="primary" onClick={accept}>
						Accept draw
					</Button>
				</>
			}
		>
			<div class="game-end-dialog__body">
				<p class="game-end-dialog__text">Both players agree to end the game as a draw?</p>
			</div>
		</Modal>
	);
}

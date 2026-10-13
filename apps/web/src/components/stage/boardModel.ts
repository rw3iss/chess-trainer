// Pure mapping: Session + settings → BoardViewModel (no chess rules here —
// everything comes from @chess/core).
import { getNode, legalDests, positionStatus, type Color, type SquareName } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import type { BoardViewModel } from '@/components/board';
import type { BoardDisplaySettings } from '@/state/settings';

export function lastMoveOf(session: Session): [SquareName, SquareName] | undefined {
	const node = getNode(session.tree, session.cursor);
	if (!node.uci || node.uci.length < 4) return undefined;
	return [node.uci.slice(0, 2), node.uci.slice(2, 4)];
}

export function movableFor(session: Session): BoardViewModel['movable'] {
	if (session.result) return 'none';
	if (session.mode === 'bot' && session.bot) return session.bot.color === 'white' ? 'black' : 'white';
	if (session.mode === 'online') return 'none'; // online feature sets this per seat
	return 'both';
}

export function boardViewModel(session: Session, board: BoardDisplaySettings): BoardViewModel {
	const fen = getNode(session.tree, session.cursor).fen;
	const status = positionStatus(fen);
	const movable = movableFor(session);
	return {
		fen,
		orientation: session.orientation,
		lastMove: lastMoveOf(session),
		check: status.checkSquare,
		dests: movable === 'none' ? new Map() : legalDests(fen),
		movable,
		arrows: [],
		marks: [],
		animationMs: board.animationMs,
		coordinates: board.coordinates,
		showLegalDots: board.showLegalDots,
		showLastMove: board.showLastMove,
		showCheck: board.showCheck,
		input: board.input,
	};
}

/** Player label for a side, given the session mode. */
export function playerLabel(session: Session, color: Color): string {
	if (session.mode === 'bot' && session.bot) return session.bot.color === color ? `Bot · ${session.bot.targetElo}` : 'You';
	return color === 'white' ? 'White' : 'Black';
}

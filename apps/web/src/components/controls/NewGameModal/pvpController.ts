// Local PvP behaviour: with pvp.autoFlip, the board turns to the side to move
// after every NEW move. Pure decision + a tiny subscription.
import { turnFromFen, type Color } from '@chess/core/chess';
import type { Session } from '@chess/core/game';

/** Orientation a local-pvp session should take after a transition, or null to leave it. */
export function autoFlipOrientation(prevNodes: number | undefined, s: Session): Color | null {
	if (s.mode !== 'local-pvp' || !s.pvp?.autoFlip || s.pvp.tabletop || s.result) return null;
	const nodes = Object.keys(s.tree.nodes).length;
	if (prevNodes === undefined || nodes <= prevNodes) return null;
	const fen = s.tree.nodes[s.cursor]?.fen;
	if (!fen) return null;
	const turn = turnFromFen(fen);
	return turn === s.orientation ? null : turn;
}

export interface PvpControllerDeps {
	sessions(): Session[];
	subscribe(fn: () => void): () => void;
	setOrientation(id: string, color: Color): void;
}

export function startPvpController(deps: PvpControllerDeps): () => void {
	const seen = new Map<string, number>();
	return deps.subscribe(() => {
		for (const s of deps.sessions()) {
			const prev = seen.get(s.id);
			seen.set(s.id, Object.keys(s.tree.nodes).length);
			const next = autoFlipOrientation(prev, s);
			if (next) deps.setOrientation(s.id, next);
		}
	});
}

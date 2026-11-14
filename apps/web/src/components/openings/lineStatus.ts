// Where a session's line stands against the openings book — shared by the Moves panel
// (header, "Built on", "Variations") and the live session title.
import { ROOT_ID, lineEnd, uciPathTo, type MoveTree } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import type { OpeningEntry, OpeningIndex } from '@chess/core/openings';

export interface LineStatus {
	/** Deepest named opening along the line (or the session's source opening when deeper). */
	base?: OpeningEntry;
	/** Moves played after `base` was reached (0 = the line ends on the named opening). */
	extra: number;
	/** The final position is still a book position. */
	inBook: boolean;
	/** FEN of the final position. */
	fen: string;
}

/** Status of the line from the start to `nodeId`. */
export function lineStatus(index: OpeningIndex, tree: MoveTree, nodeId: string, sourceOpeningId?: string): LineStatus {
	const path = uciPathTo(tree, nodeId);
	const m = index.matchLine(path, tree.nodes[ROOT_ID]!.fen);
	const src = sourceOpeningId ? index.byId(sourceOpeningId) : undefined;
	const srcOnLine = src && src.uci.length <= m.plies && src.uci.every((u, i) => path[i] === u) ? src : undefined;
	const useSrc = !!srcOnLine && (!m.opening || srcOnLine.plies > m.openingPly);
	const base = useSrc ? srcOnLine : m.opening;
	const basePly = useSrc ? srcOnLine!.plies : m.openingPly;
	return { base, extra: base ? m.plies - basePly : 0, inBook: m.inBook, fen: m.fen };
}

/** Status of the session's current line: from the start to the end of the cursor's line. */
export function sessionLineStatus(index: OpeningIndex, session: Session): LineStatus {
	return lineStatus(index, session.tree, lineEnd(session.tree, session.cursor), session.source.openingId);
}

export const CUSTOM_SUFFIX = ' (custom)';

/** Title for an opening session: the opening name, marked "(custom)" after own moves. */
export function openingTitle(status: LineStatus): string | undefined {
	if (!status.base) return undefined;
	return status.extra > 0 ? status.base.name + CUSTOM_SUFFIX : status.base.name;
}

/** Session (open game tab) and SavedGame reducers. Pure: every function returns new objects. */
import { newId } from '../chess/id.js';
import { isFiftyMove, isRepetition, positionStatus } from '../chess/position.js';
import { addMove, createTree, getNode, lineEnd, mainline, pathTo, treeFromUci, truncateTo } from '../chess/tree.js';
import { ROOT_ID, type GameResult, type MoveTree, type Uci } from '../chess/types.js';
import type { OpeningEntry } from '../openings/types.js';
import type { NewSessionOptions, SavedGame, Session } from './types.js';

const MODE_LABEL: Record<Session['mode'], string> = {
	analysis: 'Analysis',
	bot: 'Bot game',
	'local-pvp': 'Local game',
	online: 'Online game',
};

/** Title from mode / bot settings plus the first few moves, e.g. 'Bot 1500 — 1.e4 e5 2.Nf3'. */
export function defaultTitle(session: Pick<Session, 'mode' | 'tree' | 'bot'>): string {
	const label = session.mode === 'bot' && session.bot ? `Bot ${session.bot.targetElo}` : MODE_LABEL[session.mode];
	const root = getNode(session.tree, ROOT_ID);
	const startPly = root.fen.split(' ')[1] === 'b' ? 1 : 0;
	const fullmove = Number(root.fen.split(' ')[5]) || 1;
	const moves = mainline(session.tree).slice(0, 6);
	if (!moves.length) return label;
	const parts: string[] = [];
	moves.forEach((n, i) => {
		const ply = startPly + i;
		const num = fullmove + Math.floor(ply / 2);
		if (ply % 2 === 0) parts.push(`${num}.${n.san}`);
		else parts.push(i === 0 ? `${num}...${n.san}` : n.san);
	});
	return `${label} — ${parts.join(' ')}`;
}

export function createSession(opts: NewSessionOptions = {}): Session {
	const now = opts.now ?? Date.now();
	const tree = opts.tree ?? createTree(opts.fen);
	const mode = opts.mode ?? 'analysis';
	const cursor = opts.cursor && tree.nodes[opts.cursor] ? opts.cursor : ROOT_ID;
	return {
		id: opts.id ?? newId(),
		title: opts.title ?? defaultTitle({ mode, tree }),
		tree,
		cursor,
		orientation: opts.orientation ?? 'white',
		mode,
		source: opts.source ?? { kind: 'new' },
		playback: { speed: 'medium', playing: false },
		dirty: false,
		createdAt: now,
		updatedAt: now,
		revision: 0,
	};
}

export function sessionFromOpening(entry: OpeningEntry, opts: NewSessionOptions = {}): Session {
	return createSession({
		...opts,
		tree: treeFromUci(entry.uci),
		cursor: ROOT_ID,
		title: opts.title ?? entry.name,
		orientation: opts.orientation ?? entry.perspective,
		source: { kind: 'opening', openingId: entry.id },
	});
}

/** New analysis session holding only the root → nodeId line, cursor at nodeId. */
export function forkSession(session: Session, nodeId: string, now: number = Date.now()): Session {
	return createSession({
		tree: truncateTo(session.tree, nodeId),
		cursor: nodeId,
		title: `${session.title} (fork)`,
		orientation: session.orientation,
		mode: 'analysis',
		source: { kind: 'fork', parentSessionId: session.id, atNodeId: nodeId },
		now,
	});
}

export function sessionFromSavedGame(game: SavedGame, now: number = Date.now()): Session {
	const s = createSession({
		tree: game.tree,
		cursor: lineEnd(game.tree, ROOT_ID),
		title: game.name,
		mode: 'analysis',
		source: { kind: 'saved', savedGameId: game.id },
		now,
	});
	const out: Session = { ...s, savedGameId: game.id };
	if (game.result) out.result = game.result;
	return out;
}

function bump(session: Session, patch: Partial<Session>, now: number): Session {
	return { ...session, ...patch, updatedAt: now, revision: session.revision + 1 };
}

/** Add `uci` at the cursor (reusing an existing child), move the cursor there, refresh `result`. Null if illegal. */
export function sessionMove(session: Session, uci: Uci, now: number = Date.now()): Session | null {
	const res = addMove(session.tree, session.cursor, uci);
	if (!res) return null;
	const changed = res.tree !== session.tree;
	const fens = pathTo(res.tree, res.nodeId).map((n) => n.fen);
	const detected = detectResult(fens[fens.length - 1]!, fens);
	const next = bump(session, { tree: res.tree, cursor: res.nodeId, dirty: session.dirty || changed }, now);
	// A rule result (mate, stalemate, …) belongs to the new node. A manual result (resign, timeout)
	// sticks only while it is active; a move from an earlier position starts a new line and clears it.
	const kept = session.mode !== 'analysis' ? activeResult(session) : undefined;
	if (detected) {
		next.result = detected;
		next.resultNodeId = res.nodeId;
	} else if (kept) {
		next.result = kept;
		next.resultNodeId = session.resultNodeId ?? session.cursor;
	} else {
		delete next.result;
		delete next.resultNodeId;
	}
	return next;
}

/**
 * The result that applies to the position on the board: only when the cursor is on the node where
 * the game ended. Stepping back hides it, so play can continue from an earlier move.
 */
export function activeResult(session: Pick<Session, 'result' | 'resultNodeId' | 'cursor' | 'tree'>): GameResult | undefined {
	if (!session.result) return undefined;
	if (session.resultNodeId) return session.cursor === session.resultNodeId ? session.result : undefined;
	const node = session.tree.nodes[session.cursor];
	return node && node.children.length === 0 ? session.result : undefined;
}

export function sessionGoto(session: Session, nodeId: string): Session {
	getNode(session.tree, nodeId);
	return nodeId === session.cursor ? session : { ...session, cursor: nodeId };
}

/** Move the cursor ±delta plies along the current line (forward follows children[0]). Clamped. */
export function sessionStep(session: Session, delta: number): Session {
	let id = session.cursor;
	const steps = Math.trunc(Math.abs(delta));
	for (let i = 0; i < steps; i++) {
		const node = getNode(session.tree, id);
		const next = delta > 0 ? node.children[0] : node.parentId;
		if (next === undefined || next === null) break;
		id = next;
	}
	return sessionGoto(session, id);
}

export function sessionToStart(session: Session): Session {
	return sessionGoto(session, ROOT_ID);
}

export function sessionToEnd(session: Session): Session {
	return sessionGoto(session, lineEnd(session.tree, session.cursor));
}

/** Shallow patch; bumps updatedAt + revision. */
export function sessionUpdate(session: Session, patch: Partial<Session>, now: number = Date.now()): Session {
	// A manual result (resign, timeout, draw) is tied to the position it was set on.
	if ('result' in patch) {
		if (patch.result && !patch.resultNodeId) patch = { ...patch, resultNodeId: patch.cursor ?? session.cursor };
		if (!patch.result) {
			const next = bump(session, patch, now);
			delete next.result;
			delete next.resultNodeId;
			return next;
		}
	}
	return bump(session, patch, now);
}

export function currentFen(session: Session): string {
	return getNode(session.tree, session.cursor).fen;
}

function mainlineEndFen(tree: MoveTree): string {
	return getNode(tree, lineEnd(tree, ROOT_ID)).fen;
}

/**
 * Snapshot a session as a SavedGame.
 * - Overwrite (`asNew: false` with `existing`): keeps id / createdAt / favorite, bumps revision.
 * - New (`asNew: true`, or no `existing`): fresh id; when `asNew`, `parentGameId` = session.savedGameId.
 */
export function savedGameFromSession(
	session: Session,
	opts: { name: string; tags?: string[]; asNew: boolean; existing?: SavedGame; now?: number },
): SavedGame {
	const now = opts.now ?? Date.now();
	const body = {
		name: opts.name,
		tree: session.tree,
		finalFen: mainlineEndFen(session.tree),
		source: session.source,
		mode: session.mode,
	};
	if (!opts.asNew && opts.existing) {
		const game: SavedGame = {
			...opts.existing,
			...body,
			tags: opts.tags ?? opts.existing.tags,
			updatedAt: now,
			revision: opts.existing.revision + 1,
		};
		if (session.result) game.result = session.result;
		else delete game.result;
		return game;
	}
	const game: SavedGame = {
		id: newId(),
		...body,
		tags: opts.tags ? [...opts.tags] : [],
		favorite: false,
		createdAt: now,
		updatedAt: now,
		revision: 0,
	};
	if (session.result) game.result = session.result;
	if (opts.asNew && session.savedGameId) game.parentGameId = session.savedGameId;
	return game;
}

/** Link a session to the saved game it now overwrites; clears dirty and adopts the game name as title. */
export function linkSessionToSaved(session: Session, game: SavedGame): Session {
	return { ...session, savedGameId: game.id, title: game.name, dirty: false };
}

/** Rule-based result of the position (checkmate, stalemate, insufficient material, fifty-move, threefold). */
export function detectResult(fen: string, history?: string[]): GameResult | undefined {
	const st = positionStatus(fen);
	if (st.checkmate) return { winner: st.turn === 'white' ? 'black' : 'white', reason: 'checkmate' };
	if (st.stalemate) return { winner: null, reason: 'stalemate' };
	if (st.insufficientMaterial) return { winner: null, reason: 'insufficient' };
	if (isFiftyMove(fen)) return { winner: null, reason: 'fifty-move' };
	if (history?.length) {
		const fens = history[history.length - 1] === fen ? history : [...history, fen];
		if (isRepetition(fens)) return { winner: null, reason: 'repetition' };
	}
	return undefined;
}

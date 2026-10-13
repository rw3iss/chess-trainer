// Pure mapping between the server's RoomState and a local online Session.
// The session tree is the room's mainline only (local moves are never committed
// before the server accepts them), so syncing = append the missing moves, or
// rebuild when the histories diverge (e.g. after a resync).
import { ROOT_ID, addMove, mainline, treeFromUci, type Color, type Uci } from '@chess/core/chess';
import type { ClockState } from '@chess/core/clock';
import type { Session } from '@chess/core/game';
import type { RoomState } from '@chess/core/protocol';

export type Seat = Color | 'spectator';

/** UCI list of the session's mainline. */
export function mainlineUcis(session: Pick<Session, 'tree'>): Uci[] {
	return mainline(session.tree, ROOT_ID).map((n) => n.uci);
}

function lastId(tree: Session['tree']): string {
	const line = mainline(tree, ROOT_ID);
	return line.length ? line[line.length - 1]!.id : ROOT_ID;
}

/**
 * Bring the session tree in line with `moves` from `startFen`.
 * The cursor follows the new last move when it was at the old end (or the tree was rebuilt);
 * otherwise the user keeps browsing where they were.
 */
export function syncTree(session: Pick<Session, 'tree' | 'cursor'>, startFen: string, moves: Uci[]): Pick<Session, 'tree' | 'cursor'> {
	const root = session.tree.nodes[ROOT_ID];
	const current = mainlineUcis(session);
	const prefix = root?.fen === startFen && current.length <= moves.length && current.every((u, i) => moves[i] === u);
	if (!prefix) {
		const tree = treeFromUci(moves, startFen);
		return { tree, cursor: lastId(tree) };
	}
	if (current.length === moves.length) return session;
	const oldEnd = lastId(session.tree);
	const followCursor = session.cursor === oldEnd;
	let tree = session.tree;
	let at = oldEnd;
	for (const uci of moves.slice(current.length)) {
		const res = addMove(tree, at, uci);
		if (!res) break;
		tree = res.tree;
		at = res.nodeId;
	}
	return { tree, cursor: followCursor ? at : session.cursor };
}

/**
 * Translate a server clock into local time. The server stamps `lastStartedAt` with its
 * own clock; `skewMs` = local − server (estimated when a move arrives).
 */
export function localClock(clock: ClockState | undefined, skewMs: number): ClockState | undefined {
	if (!clock) return undefined;
	if (clock.lastStartedAt === null || !skewMs) return clock;
	return { ...clock, lastStartedAt: clock.lastStartedAt + skewMs };
}

/** Patch to apply to the online session for a room state. */
export function roomSessionPatch(session: Session, room: RoomState, skewMs = 0): Partial<Session> {
	const { tree, cursor } = syncTree(session, room.startFen, room.moves);
	const patch: Partial<Session> = { clock: localClock(room.clock, skewMs), result: room.result };
	if (tree !== session.tree) patch.tree = tree;
	if (cursor !== session.cursor) patch.cursor = cursor;
	return patch;
}

/** The seat's colour, or null for spectators. */
export function seatColor(seat: Seat | null): Color | null {
	return seat === 'white' || seat === 'black' ? seat : null;
}

/** Players present in both seats? */
export function roomIsFull(room: Pick<RoomState, 'players'>): boolean {
	return !!room.players.white && !!room.players.black;
}

/** Shareable link for a room. */
export function roomLink(roomId: string, origin: string = typeof location === 'undefined' ? '' : location.origin): string {
	return `${origin}/play/${encodeURIComponent(roomId)}`;
}

/** Extract a room id from a pasted link or a bare id. */
export function parseRoomRef(input: string): string | null {
	const text = input.trim();
	if (!text) return null;
	const m = /\/play\/([^/?#\s]+)/.exec(text);
	const id = m ? decodeURIComponent(m[1]!) : text;
	return /^[A-Za-z0-9_-]{3,64}$/.test(id) && id !== 'new' ? id : null;
}

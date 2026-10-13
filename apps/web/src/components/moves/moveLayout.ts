// Pure layout of a MoveTree for the move list (no Preact).
// Mainline → two-column rows; a row breaks wherever a mainline move has
// variations or a comment/note, which render as blocks between rows.
import { ROOT_ID, getNode, type MoveNode, type MoveTree } from '@chess/core/chess';

export interface MoveRowItem {
	kind: 'row';
	/** Full-move number. */
	num: number;
	white: MoveNode | null;
	black: MoveNode | null;
	/** True when the white cell is an elided "…" continuation. */
	elidedWhite: boolean;
}

export interface MoveCommentItem {
	kind: 'comment';
	node: MoveNode;
}

export interface MoveVariationsItem {
	kind: 'variations';
	/** First node of each alternative line (siblings of the mainline move). */
	lines: MoveNode[];
}

export type MoveListItem = MoveRowItem | MoveCommentItem | MoveVariationsItem;

/** Full-move number for a ply, accounting for the start FEN's fullmove counter and side. */
export function moveNumber(node: MoveNode, rootFen: string): number {
	const parts = rootFen.split(' ');
	const fullmove = Number(parts[5]) || 1;
	const blackStarts = parts[1] === 'b';
	const plyIndex = node.ply - 1 + (blackStarts ? 1 : 0);
	return fullmove + Math.floor(plyIndex / 2);
}

export function isWhiteMove(node: MoveNode, rootFen: string): boolean {
	const blackStarts = rootFen.split(' ')[1] === 'b';
	return (node.ply % 2 === 1) !== blackStarts;
}

export function hasAnnotation(node: MoveNode): boolean {
	return !!(node.comment?.trim() || node.userNote?.trim());
}

export function layoutMainline(tree: MoveTree): MoveListItem[] {
	const root = getNode(tree, ROOT_ID);
	const rootFen = root.fen;
	const items: MoveListItem[] = [];
	let row: MoveRowItem | null = null;
	let node: MoveNode = root;

	const flush = () => {
		if (row) items.push(row);
		row = null;
	};

	if (root.comment?.trim()) items.push({ kind: 'comment', node: root });

	while (node.children.length) {
		const parent: MoveNode = node;
		const next = getNode(tree, parent.children[0]!);
		const alternatives = parent.children.slice(1).map((id) => getNode(tree, id));
		const white = isWhiteMove(next, rootFen);
		const num = moveNumber(next, rootFen);
		if (white) {
			flush();
			row = { kind: 'row', num, white: next, black: null, elidedWhite: false };
		} else {
			if (!row) row = { kind: 'row', num, white: null, black: null, elidedWhite: true };
			row.black = next;
		}
		const breaks = alternatives.length > 0 || hasAnnotation(next);
		if (breaks) {
			flush();
			if (hasAnnotation(next)) items.push({ kind: 'comment', node: next });
			if (alternatives.length) items.push({ kind: 'variations', lines: alternatives });
		}
		node = next;
	}
	flush();
	return items;
}

/** A variation line as a flat token stream (for inline rendering). */
export type LineToken =
	| { kind: 'move'; node: MoveNode; label?: string }
	| { kind: 'comment'; node: MoveNode }
	| { kind: 'sub'; lines: MoveNode[] };

/** Follow children[0] from `start`, emitting moves, annotations and nested sub-variations. */
export function layoutLine(tree: MoveTree, start: MoveNode): LineToken[] {
	const rootFen = getNode(tree, ROOT_ID).fen;
	const out: LineToken[] = [];
	let cur: MoveNode | undefined = start;
	let first = true;
	let afterBreak = false;
	while (cur) {
		const white = isWhiteMove(cur, rootFen);
		const num = moveNumber(cur, rootFen);
		const label = white ? `${num}.` : first || afterBreak ? `${num}…` : undefined;
		out.push({ kind: 'move', node: cur, label });
		afterBreak = false;
		if (hasAnnotation(cur)) {
			out.push({ kind: 'comment', node: cur });
			afterBreak = true;
		}
		const parent: MoveNode | null = cur.parentId ? getNode(tree, cur.parentId) : null;
		// Alternatives to `cur` are rendered right after it (only for non-first nodes; the
		// first node's siblings are already listed by the caller).
		if (!first && parent && parent.children[0] === cur.id && parent.children.length > 1) {
			out.push({ kind: 'sub', lines: parent.children.slice(1).map((id) => getNode(tree, id)) });
			afterBreak = true;
		}
		first = false;
		const nextId: string | undefined = cur.children[0];
		cur = nextId ? getNode(tree, nextId) : undefined;
	}
	return out;
}

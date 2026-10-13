/**
 * PGN import/export via chessops/pgn. Supports multiple games, variations,
 * comments (incl. pre-move comments), NAGs and FEN/SetUp headers.
 */
import { makeFen } from 'chessops/fen';
import {
	ChildNode,
	defaultHeaders,
	makePgn,
	parseComment,
	parsePgn,
	startingPosition,
	type Game,
	type Node as PgnNode,
	type PgnNodeData,
} from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import type { Chess } from 'chessops/chess';
import { moveToUci } from './position.js';
import { appendMoveMut, createTree, getNode } from './tree.js';
import { INITIAL_FEN, ROOT_ID, type MoveNode, type MoveTree, type PgnGame } from './types.js';

function cleanComments(comments: string[] | undefined): string[] {
	if (!comments) return [];
	return comments.map((c) => parseComment(c).text.trim()).filter((c) => c.length > 0);
}

/** Export a tree to PGN. `userNote` is written as a separate comment after `comment`. */
export function treeToPgn(tree: MoveTree, headers: Record<string, string> = {}): string {
	const root = getNode(tree, tree.rootId);
	const h = defaultHeaders();
	for (const [k, v] of Object.entries(headers)) h.set(k, v);
	if (root.fen !== INITIAL_FEN) {
		h.set('SetUp', '1');
		h.set('FEN', root.fen);
	} else if (!('FEN' in headers)) {
		h.delete('FEN');
		h.delete('SetUp');
	}

	const toChild = (node: MoveNode): ChildNode<PgnNodeData> => {
		const data: PgnNodeData = { san: node.san };
		const comments = [node.comment, node.userNote].filter((c): c is string => !!c && c.trim() !== '');
		if (comments.length) data.comments = comments;
		if (node.nags?.length) data.nags = [...node.nags];
		return new ChildNode(data);
	};

	const game: Game<PgnNodeData> = { headers: h, moves: new ChildNode<PgnNodeData>({ san: '' }) };
	const rootComments = [root.comment, root.userNote].filter((c): c is string => !!c && c.trim() !== '');
	if (rootComments.length) game.comments = rootComments;

	// Iterative DFS to avoid recursion limits on long games.
	const stack: Array<[MoveNode, PgnNode<PgnNodeData>]> = [[root, game.moves]];
	while (stack.length) {
		const [node, pgnNode] = stack.pop()!;
		for (const cid of node.children) {
			const child = getNode(tree, cid);
			const pc = toChild(child);
			pgnNode.children.push(pc);
			stack.push([child, pc]);
		}
	}
	return makePgn(game);
}

/** Parse every game in a PGN string. Games with an invalid start position are skipped; illegal moves end their branch. */
export function pgnToGames(pgn: string): PgnGame[] {
	const out: PgnGame[] = [];
	for (const game of parsePgn(pgn)) {
		const start = startingPosition(game.headers);
		if (start.isErr) continue;
		const startPos = start.value as Chess;
		const headers: Record<string, string> = {};
		for (const [k, v] of game.headers) headers[k] = v;

		const base = createTree(makeFen(startPos.toSetup()));
		const nodes: Record<string, MoveNode> = { ...base.nodes };
		const rootComments = cleanComments(game.comments);
		if (rootComments.length) nodes[ROOT_ID] = { ...nodes[ROOT_ID]!, comment: rootComments.join(' ') };

		const stack: Array<[PgnNode<PgnNodeData>, Chess, string]> = [[game.moves, startPos, ROOT_ID]];
		while (stack.length) {
			const [pgnNode, pos, parentId] = stack.pop()!;
			for (const child of pgnNode.children) {
				const data = child.data;
				const move = parseSan(pos, data.san);
				if (!move || !('from' in move)) continue;
				const id = appendMoveMut(nodes, parentId, moveToUci(pos, move));
				if (!id) continue;
				const comments = [...cleanComments(data.startingComments), ...cleanComments(data.comments)];
				const node = { ...nodes[id]! };
				if (comments.length) node.comment = node.comment ? `${node.comment} ${comments.join(' ')}` : comments.join(' ');
				if (data.nags?.length) node.nags = [...new Set([...(node.nags ?? []), ...data.nags])];
				nodes[id] = node;
				const after = pos.clone();
				after.play(move);
				stack.push([child, after, id]);
			}
		}
		out.push({ headers, tree: { rootId: ROOT_ID, nodes } });
	}
	return out;
}

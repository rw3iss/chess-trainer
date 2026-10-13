/**
 * Immutable move-tree operations. Every function returns a new tree (structural
 * sharing of untouched nodes) and never mutates its input.
 */
import { newId } from './id.js';
import { applyUci } from './position.js';
import { INITIAL_FEN, ROOT_ID, type MoveNode, type MoveTree, type Uci } from './types.js';

export function createTree(fen: string = INITIAL_FEN): MoveTree {
	return {
		rootId: ROOT_ID,
		nodes: {
			[ROOT_ID]: { id: ROOT_ID, parentId: null, ply: 0, san: '', uci: '', fen, children: [] },
		},
	};
}

export function getNode(tree: MoveTree, id: string): MoveNode {
	const node = tree.nodes[id];
	if (!node) throw new Error(`MoveTree: node '${id}' not found`);
	return node;
}

/**
 * Internal mutable append used by builders (treeFromUci, PGN import). Mutates
 * `nodes` — callers own the record. Returns the child id or null if illegal.
 */
export function appendMoveMut(nodes: Record<string, MoveNode>, parentId: string, uci: Uci): string | null {
	const parent = nodes[parentId];
	if (!parent) return null;
	for (const cid of parent.children) {
		if (nodes[cid]?.uci === uci) return cid;
	}
	const res = applyUci(parent.fen, uci);
	if (!res) return null;
	for (const cid of parent.children) {
		if (nodes[cid]?.uci === res.uci) return cid;
	}
	let id = newId();
	while (nodes[id]) id = newId();
	nodes[id] = { id, parentId, ply: parent.ply + 1, san: res.san, uci: res.uci, fen: res.fen, children: [] };
	nodes[parentId] = { ...parent, children: [...parent.children, id] };
	return id;
}

/** Mainline tree from a UCI list. Stops at the first illegal move. */
export function treeFromUci(uci: Uci[], fen: string = INITIAL_FEN): MoveTree {
	const tree = createTree(fen);
	const nodes = { ...tree.nodes };
	let at: string = ROOT_ID;
	for (const u of uci) {
		const next = appendMoveMut(nodes, at, u);
		if (!next) break;
		at = next;
	}
	return { rootId: ROOT_ID, nodes };
}

/** Add `uci` under `parentId`. Reuses an existing child with the same move. Null if illegal. */
export function addMove(tree: MoveTree, parentId: string, uci: Uci): { tree: MoveTree; nodeId: string } | null {
	const parent = getNode(tree, parentId);
	for (const cid of parent.children) {
		if (tree.nodes[cid]?.uci === uci) return { tree, nodeId: cid };
	}
	const nodes = { ...tree.nodes };
	const nodeId = appendMoveMut(nodes, parentId, uci);
	if (!nodeId) return null;
	if (nodes[parentId] === parent) return { tree, nodeId }; // reused after canonicalisation
	return { tree: { rootId: tree.rootId, nodes }, nodeId };
}

/** Root → id inclusive (root first). */
export function pathTo(tree: MoveTree, id: string): MoveNode[] {
	const path: MoveNode[] = [];
	let node: MoveNode | undefined = getNode(tree, id);
	while (node) {
		path.push(node);
		node = node.parentId !== null ? tree.nodes[node.parentId] : undefined;
	}
	return path.reverse();
}

/** UCI moves from the root to `id` (root excluded). */
export function uciPathTo(tree: MoveTree, id: string): Uci[] {
	return pathTo(tree, id)
		.slice(1)
		.map((n) => n.uci);
}

/** children[0] chain after `fromId` (excluding `fromId`). */
export function mainline(tree: MoveTree, fromId: string = ROOT_ID): MoveNode[] {
	const out: MoveNode[] = [];
	let node = getNode(tree, fromId);
	while (node.children.length) {
		node = getNode(tree, node.children[0]!);
		out.push(node);
	}
	return out;
}

/** Follow children[0] from `id` to the leaf; returns the leaf id. */
export function lineEnd(tree: MoveTree, id: string): string {
	let node = getNode(tree, id);
	while (node.children.length) node = getNode(tree, node.children[0]!);
	return node.id;
}

export function nextInLine(tree: MoveTree, id: string): string | null {
	return getNode(tree, id).children[0] ?? null;
}

export function prevNode(tree: MoveTree, id: string): string | null {
	return getNode(tree, id).parentId;
}

export function isOnMainline(tree: MoveTree, id: string): boolean {
	let node = getNode(tree, id);
	while (node.parentId !== null) {
		const parent = getNode(tree, node.parentId);
		if (parent.children[0] !== node.id) return false;
		node = parent;
	}
	return true;
}

/** Remove `id` and its subtree. Deleting the root returns the tree unchanged. */
export function deleteFrom(tree: MoveTree, id: string): MoveTree {
	const node = getNode(tree, id);
	if (node.parentId === null) return tree;
	const nodes = { ...tree.nodes };
	const stack = [id];
	while (stack.length) {
		const cur = stack.pop()!;
		const n = nodes[cur];
		if (!n) continue;
		stack.push(...n.children);
		delete nodes[cur];
	}
	const parent = getNode(tree, node.parentId);
	nodes[parent.id] = { ...parent, children: parent.children.filter((c) => c !== id) };
	return { rootId: tree.rootId, nodes };
}

/** Make the branch containing `id` the first child at every ancestor. */
export function promoteVariation(tree: MoveTree, id: string): MoveTree {
	let node = getNode(tree, id);
	let nodes: Record<string, MoveNode> | null = null;
	while (node.parentId !== null) {
		const parent = (nodes ?? tree.nodes)[node.parentId]!;
		if (parent.children[0] !== node.id) {
			nodes ??= { ...tree.nodes };
			nodes[parent.id] = { ...parent, children: [node.id, ...parent.children.filter((c) => c !== node.id)] };
		}
		node = parent;
	}
	return nodes ? { rootId: tree.rootId, nodes } : tree;
}

/** New tree containing only the root → id path. Node ids preserved. */
export function truncateTo(tree: MoveTree, id: string): MoveTree {
	const path = pathTo(tree, id);
	const nodes: Record<string, MoveNode> = {};
	path.forEach((n, i) => {
		const next = path[i + 1];
		nodes[n.id] = { ...n, children: next ? [next.id] : [] };
	});
	return { rootId: tree.rootId, nodes };
}

function patchNode(tree: MoveTree, id: string, patch: (n: MoveNode) => MoveNode): MoveTree {
	const node = getNode(tree, id);
	return { rootId: tree.rootId, nodes: { ...tree.nodes, [id]: patch(node) } };
}

function withOptional<K extends 'comment' | 'userNote'>(node: MoveNode, key: K, value: string | undefined): MoveNode {
	const next = { ...node };
	if (value === undefined || value.trim() === '') delete next[key];
	else next[key] = value;
	return next;
}

/** Set (or clear with '' / undefined) the imported comment. */
export function setComment(tree: MoveTree, id: string, value: string | undefined): MoveTree {
	return patchNode(tree, id, (n) => withOptional(n, 'comment', value));
}

/** Set (or clear with '' / undefined) the user note. */
export function setUserNote(tree: MoveTree, id: string, value: string | undefined): MoveTree {
	return patchNode(tree, id, (n) => withOptional(n, 'userNote', value));
}

/** Set (or clear with [] / undefined) the NAGs. */
export function setNags(tree: MoveTree, id: string, value: number[] | undefined): MoveTree {
	return patchNode(tree, id, (n) => {
		const next = { ...n };
		if (!value || !value.length) delete next.nags;
		else next.nags = [...value];
		return next;
	});
}

export function nodeCount(tree: MoveTree): number {
	return Object.keys(tree.nodes).length;
}

/** Highest ply in the tree (0 for an empty tree). */
export function maxPly(tree: MoveTree): number {
	let max = 0;
	for (const n of Object.values(tree.nodes)) if (n.ply > max) max = n.ply;
	return max;
}

import { describe, expect, it } from 'vitest';
import {
	addMove,
	createTree,
	deleteFrom,
	getNode,
	isOnMainline,
	lineEnd,
	mainline,
	maxPly,
	nextInLine,
	nodeCount,
	pathTo,
	prevNode,
	promoteVariation,
	setComment,
	setNags,
	setUserNote,
	treeFromUci,
	truncateTo,
	uciPathTo,
} from './tree.js';
import { INITIAL_FEN, ROOT_ID, type MoveTree } from './types.js';

function add(tree: MoveTree, parent: string, uci: string): [MoveTree, string] {
	const r = addMove(tree, parent, uci);
	if (!r) throw new Error(`illegal ${uci}`);
	return [r.tree, r.nodeId];
}

/** 1.e4 e5 (1...c5 2.Nf3) 2.Nf3 */
function sample() {
	let t = createTree();
	let e4: string, e5: string, c5: string, nf3: string, nf3b: string;
	[t, e4] = add(t, ROOT_ID, 'e2e4');
	[t, e5] = add(t, e4, 'e7e5');
	[t, nf3] = add(t, e5, 'g1f3');
	[t, c5] = add(t, e4, 'c7c5');
	[t, nf3b] = add(t, c5, 'g1f3');
	return { t, e4, e5, c5, nf3, nf3b };
}

describe('tree', () => {
	it('createTree root', () => {
		const t = createTree();
		const root = getNode(t, ROOT_ID);
		expect(root).toMatchObject({ id: ROOT_ID, parentId: null, ply: 0, san: '', uci: '', fen: INITIAL_FEN, children: [] });
		expect(() => getNode(t, 'missing')).toThrow();
	});

	it('addMove adds, reuses, and is immutable', () => {
		const t0 = createTree();
		const r1 = addMove(t0, ROOT_ID, 'e2e4')!;
		expect(getNode(t0, ROOT_ID).children).toEqual([]);
		expect(getNode(r1.tree, r1.nodeId)).toMatchObject({ san: 'e4', uci: 'e2e4', ply: 1, parentId: ROOT_ID });
		const r2 = addMove(r1.tree, ROOT_ID, 'e2e4')!;
		expect(r2.nodeId).toBe(r1.nodeId);
		expect(r2.tree).toBe(r1.tree);
		expect(addMove(r1.tree, ROOT_ID, 'e2e5')).toBeNull();
	});

	it('variation is appended after the main child', () => {
		const { t, e4, e5, c5 } = sample();
		expect(getNode(t, e4).children).toEqual([e5, c5]);
		expect(nodeCount(t)).toBe(6);
		expect(maxPly(t)).toBe(3);
	});

	it('castling reuse across notations', () => {
		const fen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
		const t0 = createTree(fen);
		const a = addMove(t0, ROOT_ID, 'e1g1')!;
		const b = addMove(a.tree, ROOT_ID, 'e1h1')!;
		expect(b.nodeId).toBe(a.nodeId);
		expect(getNode(b.tree, ROOT_ID).children).toHaveLength(1);
	});

	it('paths and navigation', () => {
		const { t, e4, e5, c5, nf3, nf3b } = sample();
		expect(pathTo(t, nf3b).map((n) => n.id)).toEqual([ROOT_ID, e4, c5, nf3b]);
		expect(uciPathTo(t, nf3b)).toEqual(['e2e4', 'c7c5', 'g1f3']);
		expect(uciPathTo(t, ROOT_ID)).toEqual([]);
		expect(mainline(t).map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3']);
		expect(mainline(t, c5).map((n) => n.id)).toEqual([nf3b]);
		expect(lineEnd(t, ROOT_ID)).toBe(nf3);
		expect(lineEnd(t, c5)).toBe(nf3b);
		expect(nextInLine(t, e4)).toBe(e5);
		expect(nextInLine(t, nf3)).toBeNull();
		expect(prevNode(t, e5)).toBe(e4);
		expect(prevNode(t, ROOT_ID)).toBeNull();
		expect(isOnMainline(t, nf3)).toBe(true);
		expect(isOnMainline(t, nf3b)).toBe(false);
		expect(isOnMainline(t, ROOT_ID)).toBe(true);
	});

	it('treeFromUci builds a mainline and stops at illegal moves', () => {
		const t = treeFromUci(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']);
		expect(mainline(t).map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
		const bad = treeFromUci(['e2e4', 'e2e4', 'e7e5']);
		expect(nodeCount(bad)).toBe(2);
	});

	it('deleteFrom removes the subtree', () => {
		const { t, e4, e5, c5, nf3 } = sample();
		const d = deleteFrom(t, e5);
		expect(getNode(d, e4).children).toEqual([c5]);
		expect(d.nodes[e5]).toBeUndefined();
		expect(d.nodes[nf3]).toBeUndefined();
		expect(nodeCount(d)).toBe(4);
		expect(t.nodes[e5]).toBeDefined();
		expect(deleteFrom(t, ROOT_ID)).toBe(t);
	});

	it('promoteVariation moves the branch to first at every ancestor', () => {
		let { t, e4, e5, c5, nf3b } = sample();
		// Add a sub-variation under c5: 2.Nc3 as second child of c5.
		let nc3: string;
		[t, nc3] = add(t, c5, 'b1c3');
		const p = promoteVariation(t, nc3);
		expect(getNode(p, e4).children).toEqual([c5, e5]);
		expect(getNode(p, c5).children).toEqual([nc3, nf3b]);
		expect(isOnMainline(p, nc3)).toBe(true);
		expect(getNode(t, e4).children).toEqual([e5, c5]);
		expect(promoteVariation(p, nc3)).toBe(p);
	});

	it('truncateTo keeps only the path with ids preserved', () => {
		const { t, e4, c5, nf3b } = sample();
		const tr = truncateTo(t, c5);
		expect(Object.keys(tr.nodes).sort()).toEqual([ROOT_ID, e4, c5].sort());
		expect(getNode(tr, e4).children).toEqual([c5]);
		expect(getNode(tr, c5).children).toEqual([]);
		expect(getNode(t, c5).children).toEqual([nf3b]);
	});

	it('comment / userNote / nags set and clear', () => {
		const { t, e4 } = sample();
		let u = setComment(t, e4, 'King pawn');
		u = setUserNote(u, e4, 'my note');
		u = setNags(u, e4, [1]);
		expect(getNode(u, e4)).toMatchObject({ comment: 'King pawn', userNote: 'my note', nags: [1] });
		expect(getNode(t, e4).comment).toBeUndefined();
		u = setComment(u, e4, '');
		u = setUserNote(u, e4, undefined);
		u = setNags(u, e4, []);
		const n = getNode(u, e4);
		expect('comment' in n || 'userNote' in n || 'nags' in n).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import { addMove, createTree, getNode, setUserNote, treeFromUci, type MoveTree } from '@chess/core/chess';
import { layoutLine, layoutMainline, type MoveRowItem } from './moveLayout';

function child(tree: MoveTree, parentId: string, i = 0): string {
	return getNode(tree, parentId).children[i]!;
}

describe('moveLayout', () => {
	it('pairs mainline moves into numbered rows', () => {
		const tree = treeFromUci(['e2e4', 'e7e5', 'g1f3']);
		const rows = layoutMainline(tree) as MoveRowItem[];
		expect(rows.map((r) => [r.num, r.white?.san, r.black?.san ?? null])).toEqual([
			[1, 'e4', 'e5'],
			[2, 'Nf3', null],
		]);
	});

	it('breaks a row for variations and resumes with an elided white cell', () => {
		let tree = treeFromUci(['e2e4', 'e7e5', 'g1f3']);
		const e4 = child(tree, 'root');
		tree = addMove(tree, e4, 'c7c5')!.tree; // 1... c5 alternative to 1... e5
		const items = layoutMainline(tree);
		expect(items.map((i) => i.kind)).toEqual(['row', 'variations', 'row']);
		const resumed = items[0] as MoveRowItem;
		expect(resumed.white?.san).toBe('e4');
		expect(resumed.black?.san).toBe('e5');
		const vars = items[1];
		expect(vars.kind === 'variations' && vars.lines.map((l) => l.san)).toEqual(['c5']);
	});

	it('variations after a white move put black on an elided row', () => {
		let tree = treeFromUci(['e2e4', 'e7e5']);
		tree = addMove(tree, 'root', 'd2d4')!.tree;
		const items = layoutMainline(tree);
		expect(items.map((i) => i.kind)).toEqual(['row', 'variations', 'row']);
		expect((items[2] as MoveRowItem).elidedWhite).toBe(true);
		expect((items[2] as MoveRowItem).black?.san).toBe('e5');
	});

	it('comments/notes break the row', () => {
		let tree = treeFromUci(['e2e4', 'e7e5']);
		tree = setUserNote(tree, child(tree, 'root'), 'Best by test');
		expect(layoutMainline(tree).map((i) => i.kind)).toEqual(['row', 'comment', 'row']);
	});

	it('lays out a variation line with numbers and nested sub-variations', () => {
		let tree = treeFromUci(['e2e4', 'e7e5']);
		const e4 = child(tree, 'root');
		const r = addMove(tree, e4, 'c7c5')!;
		tree = r.tree;
		const nf3 = addMove(tree, r.nodeId, 'g1f3')!;
		tree = nf3.tree;
		tree = addMove(tree, r.nodeId, 'b1c3')!.tree; // 2. Nc3 alt to 2. Nf3 inside the variation
		const tokens = layoutLine(tree, getNode(tree, r.nodeId));
		expect(tokens.map((t) => (t.kind === 'move' ? `${t.label ?? ''}${t.node.san}` : t.kind))).toEqual(['1…c5', '2.Nf3', 'sub']);
		expect(createTree().nodes.root).toBeDefined();
	});
});

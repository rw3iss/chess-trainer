import { describe, expect, it } from 'vitest';
import { pgnToGames, treeToPgn } from './pgn.js';
import { addMove, createTree, getNode, mainline, nodeCount, setComment, setNags, setUserNote } from './tree.js';
import { ROOT_ID, type MoveTree } from './types.js';

const PGN = `[Event "Test"]
[White "A"]
[Black "B"]
[Result "1-0"]

{Intro} 1. e4 e5 {Open game} (1... c5 $1 {Sicilian} 2. Nf3 (2. Nc3) d6) 2. Nf3 Nc6 3. Bb5 $1 a6 1-0

[Event "Second"]
[SetUp "1"]
[FEN "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1"]

1. O-O O-O-O *
`;

/** Structural shape (san/comment/nags/children order) independent of ids. */
function shape(tree: MoveTree, id = ROOT_ID): unknown {
	const n = getNode(tree, id);
	return { san: n.san, comment: n.comment, nags: n.nags, children: n.children.map((c) => shape(tree, c)) };
}

describe('pgn', () => {
	it('imports multiple games with variations, comments, NAGs', () => {
		const games = pgnToGames(PGN);
		expect(games).toHaveLength(2);
		const [g1, g2] = games;
		expect(g1!.headers.Event).toBe('Test');
		expect(g1!.headers.Result).toBe('1-0');
		const t = g1!.tree;
		expect(getNode(t, ROOT_ID).comment).toBe('Intro');
		expect(mainline(t).map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
		const e4 = getNode(t, getNode(t, ROOT_ID).children[0]!);
		expect(e4.children).toHaveLength(2);
		const e5 = getNode(t, e4.children[0]!);
		const c5 = getNode(t, e4.children[1]!);
		expect(e5.comment).toBe('Open game');
		expect(c5).toMatchObject({ san: 'c5', uci: 'c7c5', nags: [1], comment: 'Sicilian' });
		const nf3 = getNode(t, c5.children[0]!);
		expect(nf3.children.map((c) => getNode(t, c).san)).toEqual(['d6']);
		expect(c5.children.map((c) => getNode(t, c).san)).toEqual(['Nf3', 'Nc3']);
		const bb5 = mainline(t)[4]!;
		expect(bb5.nags).toEqual([1]);
		expect(nodeCount(t)).toBe(11);

		// FEN header honored + castling stored as king-two-squares.
		const t2 = g2!.tree;
		expect(getNode(t2, ROOT_ID).fen).toBe('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
		expect(mainline(t2).map((n) => n.uci)).toEqual(['e1g1', 'e8c8']);
	});

	it('round-trips through PGN export', () => {
		const [g1, g2] = pgnToGames(PGN);
		const out1 = treeToPgn(g1!.tree, g1!.headers);
		expect(out1).toContain('[Event "Test"]');
		expect(out1).toContain('$1');
		expect(out1).toContain('{ Sicilian }');
		const [back1] = pgnToGames(out1);
		expect(shape(back1!.tree)).toEqual(shape(g1!.tree));
		expect(back1!.headers.Event).toBe('Test');

		const out2 = treeToPgn(g2!.tree);
		expect(out2).toContain('[FEN "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1"]');
		expect(out2).toContain('[SetUp "1"]');
		expect(out2).toContain('O-O O-O-O');
		const [back2] = pgnToGames(out2);
		expect(shape(back2!.tree)).toEqual(shape(g2!.tree));
	});

	it('exports userNote as a comment and the start position without FEN', () => {
		let t = createTree();
		const r = addMove(t, ROOT_ID, 'e2e4')!;
		t = setComment(r.tree, r.nodeId, 'best by test');
		t = setUserNote(t, r.nodeId, 'remember this');
		t = setNags(t, r.nodeId, [3]);
		const pgn = treeToPgn(t, { White: 'Me' });
		expect(pgn).not.toContain('[FEN');
		expect(pgn).toContain('[White "Me"]');
		expect(pgn).toMatch(/1\. e4 \$3 \{ best by test \} \{ remember this \}/);
		const [back] = pgnToGames(pgn);
		const e4 = mainline(back!.tree)[0]!;
		expect(e4.comment).toBe('best by test remember this');
		expect(e4.nags).toEqual([3]);
	});

	it('handles empty / junk input and stops at illegal moves', () => {
		expect(pgnToGames('')).toEqual([]);
		const [g] = pgnToGames('1. e4 e5 2. Ke3 Nc6 *');
		expect(mainline(g!.tree).map((n) => n.san)).toEqual(['e4', 'e5']);
	});

	it('strips [%clk]/[%eval] commands from comments', () => {
		const [g] = pgnToGames('1. e4 { [%clk 0:05:00] good } e5 { [%eval 0.2] } *');
		const [e4, e5] = mainline(g!.tree);
		expect(e4!.comment).toBe('good');
		expect(e5!.comment).toBeUndefined();
	});
});

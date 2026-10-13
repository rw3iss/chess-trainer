import { describe, expect, it } from 'vitest';
import { piecesFromFen } from '@chess/core';
import { cellToSquare, isLightSquare, squareFromPoint, squareToCell, stepSquare } from '../lib/geometry';
import { applyOptimisticMove, diffPieces } from '../lib/pieceDiff';
import { arrowGeometry, toggleArrow, toggleMark } from '../lib/shapes';
import { injectSpriteMarkup, isSpriteLoaded, pieceSymbolHref, pieceSymbolId } from '../lib/spriteLoader';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('geometry', () => {
	it('maps squares to display cells per orientation', () => {
		expect(squareToCell('a1', 'white')).toEqual({ x: 0, y: 7 });
		expect(squareToCell('a1', 'black')).toEqual({ x: 7, y: 0 });
		expect(squareToCell('h8', 'white')).toEqual({ x: 7, y: 0 });
		expect(cellToSquare(4, 4, 'white')).toBe('e4');
		expect(cellToSquare(4, 4, 'black')).toBe('d5');
		expect(cellToSquare(8, 0, 'white')).toBeNull();
	});
	it('colours squares', () => {
		expect(isLightSquare('a1')).toBe(false);
		expect(isLightSquare('h1')).toBe(true);
	});
	it('hit-tests points', () => {
		const r = { left: 10, top: 10, width: 400, height: 400 };
		expect(squareFromPoint(15, 405, r, 'white')).toBe('a1');
		expect(squareFromPoint(405, 15, r, 'white')).toBe('h8');
		expect(squareFromPoint(15, 405, r, 'black')).toBe('h8');
		expect(squareFromPoint(500, 15, r, 'white')).toBeNull();
	});
	it('steps keyboard focus in display space and clamps', () => {
		expect(stepSquare('e4', 0, -1, 'white')).toBe('e5');
		expect(stepSquare('e4', 0, -1, 'black')).toBe('e3');
		expect(stepSquare('a1', -1, 0, 'white')).toBe('a1');
	});
});

describe('diffPieces', () => {
	it('keeps ids for unchanged pieces and tracks a moved piece', () => {
		const a = diffPieces([], piecesFromFen(START));
		expect(a.pieces).toHaveLength(32);
		const e2 = a.pieces.find((p) => p.square === 'e2')!;
		const a1 = a.pieces.find((p) => p.square === 'a1')!;
		const b = diffPieces(a.pieces, piecesFromFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'));
		expect(b.pieces.find((p) => p.square === 'e4')!.id).toBe(e2.id);
		expect(b.pieces.find((p) => p.square === 'a1')!.id).toBe(a1.id);
		expect(b.removed).toHaveLength(0);
	});
	it('reports captured pieces as removed', () => {
		const a = diffPieces([], piecesFromFen('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'));
		const b = diffPieces(a.pieces, piecesFromFen('4k3/8/8/3P4/8/8/8/4K3 b - - 0 1'));
		expect(b.removed.map((p) => p.square)).toEqual(['d5']);
		expect(b.pieces.find((p) => p.square === 'd5')!.id).toBe(a.pieces.find((p) => p.square === 'e4')!.id);
	});
	it('tracks the rook when castling', () => {
		const a = diffPieces([], piecesFromFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1'));
		const rook = a.pieces.find((p) => p.square === 'h1')!;
		const b = diffPieces(a.pieces, piecesFromFen('4k3/8/8/8/8/8/8/5RK1 b - - 1 1'));
		expect(b.pieces.find((p) => p.square === 'f1')!.id).toBe(rook.id);
	});
	it('lets a promoted piece inherit the pawn id', () => {
		const a = diffPieces([], piecesFromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
		const pawn = a.pieces.find((p) => p.square === 'a7')!;
		const b = diffPieces(a.pieces, piecesFromFen('Q3k3/8/8/8/8/8/8/4K3 b - - 0 1'));
		expect(b.pieces.find((p) => p.square === 'a8')!.id).toBe(pawn.id);
	});
	it('applies optimistic moves', () => {
		const ps = applyOptimisticMove(piecesFromFen(START), 'e2', 'e4');
		expect(ps.find((p) => p.square === 'e4')?.role).toBe('pawn');
		expect(ps.find((p) => p.square === 'e2')).toBeUndefined();
		expect(ps).toHaveLength(32);
	});
});

describe('shapes', () => {
	it('builds straight and knight (L) arrows', () => {
		expect(arrowGeometry('e2', 'e4', 'white').shaft.split('L')).toHaveLength(2);
		expect(arrowGeometry('g1', 'f3', 'white').shaft.split('L')).toHaveLength(3);
		expect(arrowGeometry('e2', 'e4', 'white').head.startsWith('M')).toBe(true);
	});
	it('toggles user arrows and marks', () => {
		const a = toggleArrow([], { from: 'e2', to: 'e4' });
		expect(a).toHaveLength(1);
		expect(toggleArrow(a, { from: 'e2', to: 'e4' })).toHaveLength(0);
		expect(toggleArrow(a, { from: 'e2', to: 'e4', color: 'red' })[0].color).toBe('red');
		expect(toggleMark(toggleMark([], { square: 'e4', kind: 'circle' }), { square: 'e4', kind: 'circle' })).toHaveLength(0);
	});
});

describe('spriteLoader', () => {
	it('namespaces symbol ids by set and layout', () => {
		expect(pieceSymbolId({ id: 'x', layout: 'shared' }, 'black', 'knight')).toBe('x--N');
		expect(pieceSymbolId({ id: 'x', layout: 'per-color' }, 'black', 'knight')).toBe('x--bN');
		expect(pieceSymbolHref({ id: 'x', layout: 'per-color' }, 'white', 'king')).toBe('#x--wK');
	});
	it('injects sprite symbols once into a hidden container', () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="s1-g"/></defs><symbol id="K" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></symbol></svg>';
		injectSpriteMarkup('s1', svg);
		injectSpriteMarkup('s1', svg);
		expect(isSpriteLoaded('s1')).toBe(true);
		expect(document.querySelectorAll('#s1--K')).toHaveLength(1);
		expect(document.getElementById('s1-g')).not.toBeNull();
		expect(document.getElementById('piece-sprites')?.getAttribute('aria-hidden')).toBe('true');
	});
});

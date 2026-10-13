import { describe, expect, it } from 'vitest';
import { capturedPieces } from './material.js';
import { INITIAL_FEN } from './types.js';

describe('capturedPieces', () => {
	it('is empty at the start', () => {
		expect(capturedPieces(INITIAL_FEN)).toEqual({ captured: { white: [], black: [] }, advantage: { white: 0, black: 0 } });
	});

	it('lists captures per capturing side, cheapest first, with the material lead', () => {
		// White is missing a knight; black is missing a pawn and a queen.
		const fen = 'rnb1kbnr/ppp1pppp/8/8/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1';
		const r = capturedPieces(fen);
		expect(r.captured.white).toEqual(['pawn', 'queen']);
		expect(r.captured.black).toEqual(['knight']);
		expect(r.advantage).toEqual({ white: 7, black: 0 });
	});

	it('clamps promotions (extra queen) and counts real material', () => {
		// White promoted a pawn to a second queen; black is missing a rook.
		const fen = '1nbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNQ w Kk - 0 1';
		const r = capturedPieces(fen);
		expect(r.captured.white).toEqual(['rook']);
		expect(r.captured.black).toEqual(['pawn', 'rook']);
		expect(r.advantage.white).toBe(8);
	});
});

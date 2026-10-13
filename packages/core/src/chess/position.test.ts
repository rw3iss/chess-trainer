import { describe, expect, it } from 'vitest';
import {
	applyUci,
	isFiftyMove,
	isPromotionMove,
	isRepetition,
	legalDests,
	makeUci,
	piecesFromFen,
	positionStatus,
	randomLegalMove,
	sanToUci,
	toEpd,
	turnFromFen,
	uciToSan,
	validateFen,
} from './position.js';
import { INITIAL_FEN } from './types.js';

const CASTLE_FEN = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
const PROMO_FEN = '8/P7/8/8/8/8/8/k6K w - - 0 1';

describe('position', () => {
	it('legal dests from the start position', () => {
		const d = legalDests(INITIAL_FEN);
		expect(d.get('e2')?.sort()).toEqual(['e3', 'e4']);
		expect(d.get('g1')?.sort()).toEqual(['f3', 'h3']);
		expect([...d.values()].flat()).toHaveLength(20);
	});

	it('castling dests use king-two-squares', () => {
		const d = legalDests(CASTLE_FEN);
		expect(d.get('e1')?.sort()).toEqual(['c1', 'd1', 'f1', 'g1']);
		expect(d.get('e1')).not.toContain('h1');
	});

	it('applies castling UCI in both notations and returns canonical uci', () => {
		const a = applyUci(CASTLE_FEN, 'e1g1')!;
		expect(a.san).toBe('O-O');
		expect(a.uci).toBe('e1g1');
		expect(a.fen.split(' ')[0]).toBe('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1');
		const b = applyUci(CASTLE_FEN, 'e1h1')!;
		expect(b.uci).toBe('e1g1');
		expect(b.fen).toBe(a.fen);
		expect(applyUci(CASTLE_FEN, 'e1c1')!.san).toBe('O-O-O');
	});

	it('rejects illegal moves', () => {
		expect(applyUci(INITIAL_FEN, 'e2e5')).toBeNull();
		expect(applyUci(INITIAL_FEN, 'xx')).toBeNull();
		expect(applyUci('garbage', 'e2e4')).toBeNull();
	});

	it('promotion UCI', () => {
		expect(isPromotionMove(PROMO_FEN, 'a7', 'a8')).toBe(true);
		expect(isPromotionMove(INITIAL_FEN, 'e2', 'e4')).toBe(false);
		expect(makeUci('a7', 'a8', 'knight')).toBe('a7a8n');
		expect(applyUci(PROMO_FEN, 'a7a8q')!.san).toBe('a8=Q+');
		expect(applyUci(PROMO_FEN, 'a7a8n')!.san).toBe('a8=N');
		expect(sanToUci(PROMO_FEN, 'a8=R')).toBe('a7a8r');
	});

	it('san <-> uci', () => {
		expect(sanToUci(INITIAL_FEN, 'Nf3')).toBe('g1f3');
		expect(sanToUci(CASTLE_FEN, 'O-O')).toBe('e1g1');
		expect(sanToUci(CASTLE_FEN, 'O-O-O')).toBe('e1c1');
		expect(sanToUci(INITIAL_FEN, 'Nf6')).toBeNull();
		expect(uciToSan(INITIAL_FEN, 'e2e4')).toBe('e4');
		expect(uciToSan(CASTLE_FEN, 'e1g1')).toBe('O-O');
		expect(uciToSan(INITIAL_FEN, 'e2e5')).toBeNull();
	});

	it('positionStatus: checkmate', () => {
		const fen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
		const st = positionStatus(fen);
		expect(st.checkmate).toBe(true);
		expect(st.check).toBe(true);
		expect(st.checkSquare).toBe('e1');
		expect(st.outcome).toEqual({ winner: 'black' });
	});

	it('positionStatus: stalemate', () => {
		const st = positionStatus('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
		expect(st.stalemate).toBe(true);
		expect(st.checkmate).toBe(false);
		expect(st.outcome).toEqual({ winner: null });
	});

	it('positionStatus: insufficient material', () => {
		const st = positionStatus('8/8/4k3/8/8/2KB4/8/8 w - - 0 1');
		expect(st.insufficientMaterial).toBe(true);
		expect(st.outcome).toEqual({ winner: null });
	});

	it('positionStatus: normal', () => {
		const st = positionStatus(INITIAL_FEN);
		expect(st).toMatchObject({ turn: 'white', check: false, checkmate: false, stalemate: false });
		expect(st.outcome).toBeUndefined();
		expect(st.checkSquare).toBeUndefined();
	});

	it('pieces / turn / epd / validate', () => {
		const pieces = piecesFromFen(INITIAL_FEN);
		expect(pieces).toHaveLength(32);
		expect(pieces).toContainEqual({ square: 'e1', color: 'white', role: 'king' });
		expect(turnFromFen(INITIAL_FEN)).toBe('white');
		expect(turnFromFen(applyUci(INITIAL_FEN, 'e2e4')!.fen)).toBe('black');
		expect(toEpd(INITIAL_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
		expect(validateFen(INITIAL_FEN)).toBe(true);
		expect(validateFen('8/8/8/8/8/8/8/8 w - - 0 1')).toBe(false);
		expect(validateFen('nope')).toBe(false);
	});

	it('randomLegalMove is deterministic with rng and avoids mate-in-1', () => {
		expect(randomLegalMove(INITIAL_FEN, () => 0)).toMatch(/^[a-h][1-8][a-h][1-8]$/);
		expect(randomLegalMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toBeNull();
		// After 1.f3 e5, White's 2.g4 allows ...Qh4# and must never be picked.
		const fen = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
		for (let i = 0; i < 30; i++) {
			const r = i / 30;
			const uci = randomLegalMove(fen, () => r, { avoidMateIn1: true })!;
			expect(uci).not.toBe('g2g4');
		}
	});

	it('repetition and fifty-move', () => {
		const a = INITIAL_FEN;
		const b = applyUci(a, 'g1f3')!.fen;
		const c = applyUci(b, 'g8f6')!.fen;
		const d = applyUci(c, 'f3g1')!.fen;
		const e = applyUci(d, 'f6g8')!.fen;
		expect(isRepetition([a, b, c, d, e])).toBe(false);
		const f = applyUci(e, 'g1f3')!.fen;
		const g = applyUci(f, 'g8f6')!.fen;
		const h = applyUci(g, 'f3g1')!.fen;
		const i = applyUci(h, 'f6g8')!.fen;
		expect(isRepetition([a, b, c, d, e, f, g, h, i])).toBe(true);
		expect(isFiftyMove('8/8/4k3/8/8/2KR4/8/8 w - - 100 80')).toBe(true);
		expect(isFiftyMove('8/8/4k3/8/8/2KR4/8/8 w - - 99 80')).toBe(false);
	});
});

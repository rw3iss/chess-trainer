import { describe, expect, it } from 'vitest';
import {
	buildFen,
	checkSetup,
	inferCastling,
	placementFromFen,
	placementIndex,
	placementSquare,
	placementToFen,
	rotatePlacement,
} from './setup.js';
import { INITIAL_FEN } from './types.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

describe('setup', () => {
	it('index ↔ square', () => {
		expect(placementIndex('a8')).toBe(0);
		expect(placementIndex('h8')).toBe(7);
		expect(placementIndex('a1')).toBe(56);
		expect(placementIndex('h1')).toBe(63);
		expect(placementSquare(0)).toBe('a8');
		expect(placementSquare(63)).toBe('h1');
		expect(placementSquare(placementIndex('e4'))).toBe('e4');
	});

	it('placement round-trips (full FEN or placement field)', () => {
		const p = placementFromFen(INITIAL_FEN);
		expect(p).toHaveLength(64);
		expect(p[0]).toEqual({ role: 'rook', color: 'black' });
		expect(p[60]).toEqual({ role: 'king', color: 'white' });
		expect(p[placementIndex('e4')]).toBeNull();
		expect(placementToFen(p)).toBe(START);
		expect(placementToFen(placementFromFen(START))).toBe(START);
		expect(placementToFen(placementFromFen('8/8/8/4k3/8/8/8/4K3 b - - 0 1'))).toBe('8/8/8/4k3/8/8/8/4K3');
	});

	it('rejects malformed placements', () => {
		expect(() => placementFromFen('8/8/8')).toThrow();
		expect(() => placementFromFen('9/8/8/8/8/8/8/8')).toThrow();
		expect(() => placementFromFen('ppppppppp/8/8/8/8/8/8/8')).toThrow();
		expect(() => placementFromFen('x7/8/8/8/8/8/8/8')).toThrow();
	});

	it('rotates 180°', () => {
		const p = placementFromFen('k7/8/8/8/8/8/8/6RK');
		const r = rotatePlacement(p);
		expect(placementToFen(r)).toBe('KR6/8/8/8/8/8/8/7k');
		expect(placementToFen(rotatePlacement(r))).toBe(placementToFen(p));
		expect(p[0]).toEqual({ role: 'king', color: 'black' }); // input untouched
	});

	it('infers castling from king/rook home squares', () => {
		expect(inferCastling(placementFromFen(START))).toBe('KQkq');
		expect(inferCastling(placementFromFen('r3k3/8/8/8/8/8/8/4K2R'))).toBe('Kq');
		expect(inferCastling(placementFromFen('4k3/8/8/8/8/8/8/R4K1R'))).toBe('-');
	});

	it('builds a full FEN, filtering castling and ep', () => {
		const p = placementFromFen(START);
		expect(buildFen(p, { turn: 'white' })).toBe(INITIAL_FEN);
		expect(buildFen(p, { turn: 'black', castling: 'Kk' })).toBe(`${START} b Kk - 0 1`);
		const noRooks = placementFromFen('1nbqkbn1/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBN1');
		expect(buildFen(noRooks, { turn: 'white', castling: 'KQkq' })).toContain(' w - - 0 1');
		const ep = placementFromFen('4k3/8/8/3pP3/8/8/8/4K3');
		expect(buildFen(ep, { turn: 'white', castling: '-', epSquare: 'd6' })).toBe('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
		expect(buildFen(ep, { turn: 'black', castling: '-', epSquare: 'd6' })).toContain(' b - - 0 1');
		expect(buildFen(ep, { turn: 'white', castling: '-', epSquare: 'e6' })).toContain(' w - - 0 1');
	});

	it('checkSetup: legal positions', () => {
		expect(checkSetup(INITIAL_FEN)).toEqual({ ok: true, errors: [] });
		expect(checkSetup('4k3/8/8/8/8/8/8/4K3 b - - 0 1').ok).toBe(true);
	});

	it('checkSetup: friendly errors', () => {
		expect(checkSetup('8/8/8/8/8/8/8/8 w - - 0 1').errors).toEqual(['The board is empty']);
		expect(checkSetup('4k3/8/8/8/8/8/8/8 w - - 0 1').errors).toContain('White has no king');
		expect(checkSetup('4k3/8/8/8/8/8/8/k3K3 w - - 0 1').errors).toContain('Black has 2 kings');
		expect(checkSetup('P3k3/8/8/8/8/8/8/4K3 w - - 0 1').errors).toContain('Pawns on the first or last rank');
		expect(checkSetup('4k3/8/8/8/8/8/PPPPPPPP/P3K3 w - - 0 1').errors).toContain('White has more than 8 pawns');
		expect(checkSetup('4k3/8/QQQQQQQQ/QQQQQQQQ/QQ6/8/8/4K3 w - - 0 1').errors).toContain('White has too many pieces (19)');
		expect(checkSetup('4k3/8/8/8/8/8/8/4K2R w - - 0 1').ok).toBe(true);
		expect(checkSetup('4k2R/8/8/8/8/8/8/4K3 w - - 0 1').errors).toEqual(['The side not to move is in check']);
		expect(checkSetup('nonsense').errors).toEqual(['Invalid FEN']);
		expect(checkSetup('4k3/8/8/8/8/8/8/4K3 x - - 0 1').errors).toEqual(['Invalid FEN']);
	});
});

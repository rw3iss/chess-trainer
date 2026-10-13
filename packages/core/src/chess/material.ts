import { piecesFromFen } from './position.js';
import type { Color, Role } from './types.js';

/** Standard piece values (king excluded). */
export const PIECE_VALUES: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };

const START_COUNT: Record<Role, number> = { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 };
const ORDER: Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];

export interface CapturedPieces {
	/** Opponent pieces each side has captured (roles of the *other* colour), cheapest first. */
	captured: Record<Color, Role[]>;
	/** Material lead in pawns (from the pieces on the board); 0 for the side that is behind. */
	advantage: Record<Color, number>;
}

/**
 * Pieces missing from the board compared with the starting set, per capturing side.
 * Promotions are handled by clamping (an extra queen does not make captures negative);
 * the material advantage is computed from what is actually on the board.
 */
export function capturedPieces(fen: string): CapturedPieces {
	const count: Record<Color, Record<Role, number>> = {
		white: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 },
		black: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 },
	};
	for (const p of piecesFromFen(fen)) count[p.color][p.role]++;
	const missing = (color: Color): Role[] => {
		const out: Role[] = [];
		for (const role of ORDER) {
			const n = Math.max(0, START_COUNT[role] - count[color][role]);
			for (let i = 0; i < n; i++) out.push(role);
		}
		return out;
	};
	const material = (color: Color) => ORDER.reduce((sum, r) => sum + count[color][r] * PIECE_VALUES[r], 0);
	const diff = material('white') - material('black');
	return {
		captured: { white: missing('black'), black: missing('white') },
		advantage: { white: Math.max(0, diff), black: Math.max(0, -diff) },
	};
}

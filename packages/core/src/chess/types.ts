/**
 * Chess primitives shared by every layer.
 *
 * Squares are algebraic names ('e4'). Moves are UCI strings ('e2e4', 'e7e8q').
 * Castling is always expressed in standard king-two-squares UCI ('e1g1'), never
 * king-takes-rook — conversion to/from chessops' internal form happens inside
 * `position.ts`.
 */

export type Color = 'white' | 'black';
export type Role = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type PromotionRole = 'queen' | 'rook' | 'bishop' | 'knight';
export type SquareName = string;
export type Uci = string;

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const ROOT_ID = 'root';

/**
 * One position in a move tree. The root node has `san === ''`, `uci === ''`,
 * `ply === 0`, `parentId === null` and holds the starting FEN.
 * `children[0]` is the main continuation; later children are variations.
 */
export interface MoveNode {
	id: string;
	parentId: string | null;
	ply: number;
	san: string;
	uci: Uci;
	/** FEN *after* this move (root: the start FEN). */
	fen: string;
	children: string[];
	/** Comment imported from PGN / dataset notes. */
	comment?: string;
	/** Numeric annotation glyphs ($1 = !, $2 = ?, …). */
	nags?: number[];
	/** User-authored note. */
	userNote?: string;
}

/** Immutable move tree. Mainline = `children[0]` chain from the root. */
export interface MoveTree {
	rootId: typeof ROOT_ID;
	nodes: Record<string, MoveNode>;
}

export interface PositionStatus {
	turn: Color;
	check: boolean;
	/** Square of the king in check, if any. */
	checkSquare?: SquareName;
	checkmate: boolean;
	stalemate: boolean;
	insufficientMaterial: boolean;
	/** Set when the game is over by rule. `winner: null` = draw. */
	outcome?: { winner: Color | null };
}

export interface PieceOnSquare {
	square: SquareName;
	color: Color;
	role: Role;
}

export type GameEndReason =
	| 'checkmate'
	| 'stalemate'
	| 'resign'
	| 'timeout'
	| 'draw-agreed'
	| 'insufficient'
	| 'repetition'
	| 'fifty-move'
	| 'abandoned';

export interface GameResult {
	winner: Color | null;
	reason: GameEndReason;
}

export interface PgnGame {
	headers: Record<string, string>;
	tree: MoveTree;
}

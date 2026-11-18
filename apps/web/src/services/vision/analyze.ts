// From 64 classified squares (image order) to a position: orientation (white at the bottom or
// the top of the image), side to move from last-move highlights, castling, uncertain squares.
// Pure; used by the vision worker and unit tests.
import { buildFen, inferCastling, placementToFen, rotatePlacement, type Placement } from '@chess/core/chess';
import type { Color, Role, SquareName } from '@chess/core/chess';

/** Model class order (see tools/board-vision): upper = white, lower = black. */
export const PIECE_CLASSES = ['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'] as const;
export type PieceClass = (typeof PIECE_CLASSES)[number];

const ROLE: Record<string, Role> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** Squares below this top probability are flagged for the user to check. */
export const UNCERTAIN_BELOW = 0.85;

export interface SquareRead {
	cls: PieceClass;
	/** Probability of `cls`. */
	p: number;
}

/** Placement in image order (index 0 = top-left cell) from class labels. */
export function placementFromClasses(cells: readonly SquareRead[]): Placement {
	return cells.map((c) => (c.cls === 'empty' ? null : { role: ROLE[c.cls.toLowerCase()]!, color: c.cls === c.cls.toUpperCase() ? 'white' : 'black' }));
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const median = (vals: number[]) => [...vals].sort((x, y) => x - y)[Math.floor(vals.length / 2)]!;

/**
 * Which side is drawn at the bottom of the image. Positive evidence → white at the bottom:
 * white pawns sit below black pawns, the white king below the black king, white pieces lower
 * on average. Returns the color at the bottom and a 0..1 confidence.
 */
export function guessOrientation(img: Placement): { bottom: Color; confidence: number } {
	const rows: Record<Color, number[]> = { white: [], black: [] };
	const pawns: Record<Color, number[]> = { white: [], black: [] };
	const kings: Partial<Record<Color, number>> = {};
	img.forEach((pc, i) => {
		if (!pc) return;
		const row = Math.floor(i / 8); // 0 = top
		rows[pc.color].push(row);
		if (pc.role === 'pawn') pawns[pc.color].push(row);
		if (pc.role === 'king') kings[pc.color] = row;
	});
	let s = 0;
	let weight = 0;
	const add = (v: number, wgt: number) => {
		if (!Number.isFinite(v)) return;
		s += v * wgt;
		weight += wgt;
	};
	add(mean(pawns.white) - mean(pawns.black), 2);
	if (kings.white !== undefined && kings.black !== undefined) add(kings.white - kings.black, 1);
	add(mean(rows.white) - mean(rows.black), 1);
	if (!weight) return { bottom: 'white', confidence: 0 };
	const v = s / weight; // rows; ±7 max
	return { bottom: v >= 0 ? 'white' : 'black', confidence: Math.min(1, Math.abs(v) / 3) };
}

/** Square name of an image cell when `bottom` is at the bottom of the image. */
export function cellSquare(cell: number, bottom: Color): SquareName {
	const row = Math.floor(cell / 8);
	const col = cell % 8;
	const file = bottom === 'white' ? col : 7 - col;
	const rank = bottom === 'white' ? 8 - row : row + 1;
	return `${'abcdefgh'[file]}${rank}` as SquareName;
}

export interface CellColor {
	r: number;
	g: number;
	b: number;
}

/**
 * Last-move highlight cells (image order): cells whose background differs clearly from the
 * usual color of their square shade. Returns the cells only when exactly two stand out.
 */
export function findHighlights(bg: readonly CellColor[]): [number, number] | null {
	const ref: CellColor[] = [0, 1].map((parity) => {
		const cells = bg.filter((_, i) => (Math.floor(i / 8) + (i % 8)) % 2 === parity);
		return { r: median(cells.map((c) => c.r)), g: median(cells.map((c) => c.g)), b: median(cells.map((c) => c.b)) };
	});
	const dist = bg.map((c, i) => {
		const r = ref[(Math.floor(i / 8) + (i % 8)) % 2]!;
		return Math.hypot(c.r - r.r, c.g - r.g, c.b - r.b);
	});
	// Light and dark shades must differ, else this is not a usable board background.
	if (Math.hypot(ref[0]!.r - ref[1]!.r, ref[0]!.g - ref[1]!.g, ref[0]!.b - ref[1]!.b) < 12) return null;
	const out = dist.map((d, i) => [d, i] as const).filter(([d]) => d > 28);
	return out.length === 2 ? [out[0]![1], out[1]![1]] : null;
}

export interface BoardRead {
	/** Full FEN with white at the bottom (standard orientation). */
	fen: string;
	placement: string;
	/** Side drawn at the bottom of the image. */
	orientation: Color;
	orientationConfidence: number;
	turn: Color;
	/** Where `turn` came from: the last-move highlight, or the default (White). */
	turnFrom: 'highlight' | 'default';
	lastMove?: [SquareName, SquareName];
	/** Squares the model was not sure about. */
	uncertain: SquareName[];
}

/** Turn 64 reads (+ optional cell backgrounds) into a position. */
export function analyzeBoard(cells: readonly SquareRead[], bg?: readonly CellColor[]): BoardRead {
	const img = placementFromClasses(cells);
	const { bottom, confidence } = guessOrientation(img);
	const placement = bottom === 'white' ? img : rotatePlacement(img);

	let turn: Color = 'white';
	let turnFrom: BoardRead['turnFrom'] = 'default';
	let lastMove: BoardRead['lastMove'];
	const hl = bg ? findHighlights(bg) : null;
	if (hl) {
		const [a, b] = hl;
		const pa = img[a];
		const pb = img[b];
		// The move ended on the occupied square; the other side moves next.
		const to = pa && !pb ? a : pb && !pa ? b : undefined;
		if (to !== undefined) {
			const from = to === a ? b : a;
			turn = img[to]!.color === 'white' ? 'black' : 'white';
			turnFrom = 'highlight';
			lastMove = [cellSquare(from, bottom), cellSquare(to, bottom)];
		}
	}

	const uncertain = cells.flatMap((c, i) => (c.p < UNCERTAIN_BELOW ? [cellSquare(i, bottom)] : []));
	const fen = buildFen(placement, { turn, castling: inferCastling(placement) });
	return { fen, placement: placementToFen(placement), orientation: bottom, orientationConfidence: confidence, turn, turnFrom, lastMove, uncertain };
}

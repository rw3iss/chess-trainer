import type { Color, PieceOnSquare, Role, SquareName } from '@chess/core';
import { squareToIdx } from './geometry';

/** A piece with a stable identity across positions (for FLIP animation + keyed rendering). */
export interface TrackedPiece extends PieceOnSquare {
	id: string;
}

export interface PieceDiff {
	pieces: TrackedPiece[];
	/** Pieces present before but gone now (captures) — rendered fading out. */
	removed: TrackedPiece[];
}

let counter = 0;
const nextId = (): string => `p${++counter}`;

function dist(a: SquareName, b: SquareName): number {
	const A = squareToIdx(a);
	const B = squareToIdx(b);
	return Math.max(Math.abs(A.file - B.file), Math.abs(A.rank - B.rank)) + (A.file !== B.file && A.rank !== B.rank ? 0.1 : 0);
}

/**
 * Assign stable ids: same square+piece keeps its id; otherwise match to the
 * nearest unmatched previous piece of the same color+role; a new non-pawn on a
 * back rank may inherit a vanished pawn's id (promotion). Everything else gets
 * a new id. Pure apart from the id counter.
 */
export function diffPieces(prev: readonly TrackedPiece[], next: readonly PieceOnSquare[]): PieceDiff {
	const out: (TrackedPiece | null)[] = next.map(() => null);
	const used = new Set<string>();
	const prevBySquare = new Map(prev.map((p) => [p.square, p]));

	next.forEach((p, i) => {
		const q = prevBySquare.get(p.square);
		if (q && q.color === p.color && q.role === p.role) {
			out[i] = { ...p, id: q.id };
			used.add(q.id);
		}
	});

	const match = (pred: (q: TrackedPiece, p: PieceOnSquare) => boolean) => {
		// Greedy nearest matching over all remaining pairs.
		const pairs: { i: number; q: TrackedPiece; d: number }[] = [];
		next.forEach((p, i) => {
			if (out[i]) return;
			for (const q of prev) if (!used.has(q.id) && pred(q, p)) pairs.push({ i, q, d: dist(q.square, p.square) });
		});
		pairs.sort((a, b) => a.d - b.d);
		for (const { i, q } of pairs) {
			if (out[i] || used.has(q.id)) continue;
			out[i] = { ...next[i], id: q.id };
			used.add(q.id);
		}
	};

	match((q, p) => q.color === p.color && q.role === p.role);
	match((q, p) => q.color === p.color && q.role === 'pawn' && p.role !== 'pawn' && promotionRank(p.color) === squareToIdx(p.square).rank && dist(q.square, p.square) <= 1.1);

	const pieces = next.map((p, i) => out[i] ?? { ...p, id: nextId() });
	const removed = prev.filter((q) => !used.has(q.id));
	return { pieces, removed };
}

function promotionRank(color: Color): number {
	return color === 'white' ? 7 : 0;
}

/** Optimistically show from→to before the parent supplies the new FEN. */
export function applyOptimisticMove(pieces: readonly PieceOnSquare[], from: SquareName, to: SquareName, promotion?: Role): PieceOnSquare[] {
	const mover = pieces.find((p) => p.square === from);
	if (!mover) return pieces.slice();
	return pieces
		.filter((p) => p.square !== to && p.square !== from)
		.concat({ ...mover, square: to, role: promotion ?? mover.role });
}

export function pieceAt(pieces: readonly PieceOnSquare[], sq: SquareName): PieceOnSquare | undefined {
	return pieces.find((p) => p.square === sq);
}

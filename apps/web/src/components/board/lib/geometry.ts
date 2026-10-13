import type { Color, SquareName } from '@chess/core';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

/** Board-space indices: file 0..7 (a..h), rank 0..7 (1..8). */
export interface SquareIdx {
	file: number;
	rank: number;
}

/** Display-space cell: x 0..7 left→right, y 0..7 top→bottom. */
export interface Cell {
	x: number;
	y: number;
}

export function squareToIdx(sq: SquareName): SquareIdx {
	return { file: sq.charCodeAt(0) - 97, rank: sq.charCodeAt(1) - 49 };
}

export function idxToSquare(file: number, rank: number): SquareName {
	return FILES[file] + RANKS[rank];
}

export function isValidSquare(sq: string): boolean {
	return /^[a-h][1-8]$/.test(sq);
}

export function isLightSquare(sq: SquareName): boolean {
	const { file, rank } = squareToIdx(sq);
	return (file + rank) % 2 === 1;
}

export function squareToCell(sq: SquareName, orientation: Color): Cell {
	const { file, rank } = squareToIdx(sq);
	return orientation === 'white' ? { x: file, y: 7 - rank } : { x: 7 - file, y: rank };
}

export function cellToSquare(x: number, y: number, orientation: Color): SquareName | null {
	if (x < 0 || x > 7 || y < 0 || y > 7) return null;
	return orientation === 'white' ? idxToSquare(x, 7 - y) : idxToSquare(7 - x, y);
}

/** Square under a client point, given the board's client rect. */
export function squareFromPoint(
	clientX: number,
	clientY: number,
	rect: { left: number; top: number; width: number; height: number },
	orientation: Color,
): SquareName | null {
	const x = Math.floor(((clientX - rect.left) / rect.width) * 8);
	const y = Math.floor(((clientY - rect.top) / rect.height) * 8);
	return cellToSquare(x, y, orientation);
}

/** Move a keyboard-focus square by a display-space delta (dx right, dy down). */
export function stepSquare(sq: SquareName, dx: number, dy: number, orientation: Color): SquareName {
	const c = squareToCell(sq, orientation);
	const x = Math.min(7, Math.max(0, c.x + dx));
	const y = Math.min(7, Math.max(0, c.y + dy));
	return cellToSquare(x, y, orientation) ?? sq;
}

/** Percent-based translate for an element sized one square. */
export function cellTransform(c: Cell): string {
	return `translate(${c.x * 100}%, ${c.y * 100}%)`;
}

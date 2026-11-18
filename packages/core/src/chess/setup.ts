/**
 * Position setup helpers for a board editor: a flat 64-square placement,
 * FEN conversion, castling inference and friendly legality checks.
 *
 * Placement index order is FEN reading order: 0 = a8, 7 = h8, 56 = a1, 63 = h1.
 */
import { Chess, IllegalSetup } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import type { Color, Role, SquareName } from './types.js';

export interface Piece {
	role: Role;
	color: Color;
}

/** 64 entries, index 0 = a8, 7 = h8, 56 = a1, 63 = h1 (FEN reading order). */
export type Placement = (Piece | null)[];

export interface SetupOptions {
	turn: Color;
	/** 'KQkq' subset or '-'. Omitted = every right the placement allows. */
	castling?: string;
	/** En-passant target square (e.g. 'e3'); dropped unless it is plausible. */
	epSquare?: string;
}

export interface SetupCheck {
	ok: boolean;
	errors: string[];
}

const CHAR_TO_ROLE: Record<string, Role> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const ROLE_TO_CHAR: Record<Role, string> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
const CASTLING_ORDER = 'KQkq';

/** Placement index of a square name ('a8' → 0, 'h1' → 63). */
export function placementIndex(square: SquareName): number {
	return (8 - Number(square[1])) * 8 + (square.charCodeAt(0) - 97);
}

/** Square name of a placement index (0 → 'a8', 63 → 'h1'). */
export function placementSquare(index: number): SquareName {
	return String.fromCharCode(97 + (index % 8)) + String(8 - Math.floor(index / 8));
}

/**
 * Parse the placement field of a FEN (full FEN or the placement field alone).
 * Throws an Error when the placement field is malformed.
 */
export function placementFromFen(fen: string): Placement {
	const field = fen.trim().split(/\s+/)[0] ?? '';
	const rows = field.split('/');
	if (rows.length !== 8) throw new Error('Invalid FEN placement: expected 8 ranks');
	const out: Placement = [];
	for (const row of rows) {
		let width = 0;
		for (const ch of row) {
			if (ch >= '1' && ch <= '8') {
				const n = Number(ch);
				for (let i = 0; i < n; i++) out.push(null);
				width += n;
				continue;
			}
			const role = CHAR_TO_ROLE[ch.toLowerCase()];
			if (!role) throw new Error(`Invalid FEN placement: unexpected '${ch}'`);
			out.push({ role, color: ch === ch.toLowerCase() ? 'black' : 'white' });
			width++;
		}
		if (width !== 8) throw new Error('Invalid FEN placement: each rank must have 8 squares');
	}
	return out;
}

/** Placement field only (e.g. 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'). */
export function placementToFen(p: Placement): string {
	const rows: string[] = [];
	for (let r = 0; r < 8; r++) {
		let row = '';
		let empty = 0;
		for (let f = 0; f < 8; f++) {
			const pc = p[r * 8 + f];
			if (!pc) {
				empty++;
				continue;
			}
			if (empty) row += String(empty);
			empty = 0;
			const ch = ROLE_TO_CHAR[pc.role];
			row += pc.color === 'white' ? ch.toUpperCase() : ch;
		}
		if (empty) row += String(empty);
		rows.push(row);
	}
	return rows.join('/');
}

/** 180° rotation (a board image read upside down): a8 ↔ h1. */
export function rotatePlacement(p: Placement): Placement {
	const out: Placement = [];
	for (let i = 63; i >= 0; i--) out.push(p[i] ?? null);
	return out;
}

function isPiece(p: Placement, square: SquareName, color: Color, role: Role): boolean {
	const pc = p[placementIndex(square)];
	return !!pc && pc.color === color && pc.role === role;
}

/** Castling rights the placement allows (king and rook on their home squares): 'KQkq' subset, '-' if none. */
export function inferCastling(p: Placement): string {
	let out = '';
	if (isPiece(p, 'e1', 'white', 'king')) {
		if (isPiece(p, 'h1', 'white', 'rook')) out += 'K';
		if (isPiece(p, 'a1', 'white', 'rook')) out += 'Q';
	}
	if (isPiece(p, 'e8', 'black', 'king')) {
		if (isPiece(p, 'h8', 'black', 'rook')) out += 'k';
		if (isPiece(p, 'a8', 'black', 'rook')) out += 'q';
	}
	return out || '-';
}

function plausibleEp(p: Placement, turn: Color, ep: string | undefined): string {
	if (!ep || !/^[a-h][36]$/.test(ep)) return '-';
	// White to move → black just pushed two squares → target on rank 6, pawn on rank 5.
	const rank = turn === 'white' ? '6' : '3';
	if (ep[1] !== rank) return '-';
	const pawnSq = ep[0] + (turn === 'white' ? '5' : '4');
	const fromSq = ep[0] + (turn === 'white' ? '7' : '2');
	const mover: Color = turn === 'white' ? 'black' : 'white';
	if (!isPiece(p, pawnSq, mover, 'pawn')) return '-';
	if (p[placementIndex(ep)] || p[placementIndex(fromSq)]) return '-';
	return ep;
}

/** Full FEN: halfmove 0, fullmove 1; castling filtered to what the placement allows. */
export function buildFen(p: Placement, opts: SetupOptions): string {
	const allowed = inferCastling(p);
	const wanted = opts.castling === undefined ? allowed : opts.castling;
	const castling = CASTLING_ORDER.split('')
		.filter((c) => wanted.includes(c) && allowed.includes(c))
		.join('') || '-';
	const ep = plausibleEp(p, opts.turn, opts.epSquare);
	return `${placementToFen(p)} ${opts.turn === 'white' ? 'w' : 'b'} ${castling} ${ep} 0 1`;
}

const COLOR_NAME: Record<Color, string> = { white: 'White', black: 'Black' };

/** Is the setup a legal position to play from? Errors are human-readable sentences. */
export function checkSetup(fen: string): SetupCheck {
	let p: Placement;
	try {
		p = placementFromFen(fen);
	} catch {
		return { ok: false, errors: ['Invalid FEN'] };
	}
	const errors: string[] = [];
	if (p.every((pc) => !pc)) return { ok: false, errors: ['The board is empty'] };

	for (const color of ['white', 'black'] as const) {
		const own = p.filter((pc): pc is Piece => !!pc && pc.color === color);
		const kings = own.filter((pc) => pc.role === 'king').length;
		const pawns = own.filter((pc) => pc.role === 'pawn').length;
		if (kings === 0) errors.push(`${COLOR_NAME[color]} has no king`);
		else if (kings > 1) errors.push(`${COLOR_NAME[color]} has ${kings} kings`);
		if (pawns > 8) errors.push(`${COLOR_NAME[color]} has more than 8 pawns`);
		if (own.length > 16) errors.push(`${COLOR_NAME[color]} has too many pieces (${own.length})`);
	}
	const backrank = [...p.slice(0, 8), ...p.slice(56)];
	if (backrank.some((pc) => pc?.role === 'pawn')) errors.push('Pawns on the first or last rank');
	if (errors.length) return { ok: false, errors };

	const setup = parseFen(fen.trim());
	if (setup.isErr) return { ok: false, errors: ['Invalid FEN'] };
	const pos = Chess.fromSetup(setup.value);
	if (pos.isErr) {
		const msg = pos.error.message;
		if (msg === IllegalSetup.OppositeCheck) return { ok: false, errors: ['The side not to move is in check'] };
		if (msg === IllegalSetup.Kings) return { ok: false, errors: ['Each side needs exactly one king'] };
		if (msg === IllegalSetup.PawnsOnBackrank) return { ok: false, errors: ['Pawns on the first or last rank'] };
		return { ok: false, errors: ['Illegal position'] };
	}
	return { ok: true, errors: [] };
}

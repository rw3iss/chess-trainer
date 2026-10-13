/**
 * Position-level helpers over chessops. All inputs/outputs are FEN strings and
 * standard UCI (castling as king-two-squares, e.g. 'e1g1'). chessops internally
 * encodes castling as king-takes-rook ('e1h1'); conversion happens here only.
 */
import { Chess, castlingSide, normalizeMove } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { kingCastlesTo, makeSquare, makeUci as cMakeUci, parseSquare, parseUci, roleToChar } from 'chessops/util';
import type { NormalMove } from 'chessops/types';
import type { Color, PieceOnSquare, PositionStatus, PromotionRole, SquareName, Uci } from './types.js';

/** Parse a FEN into a chessops position, or null if invalid. Internal helper (exported for core modules). */
export function positionFromFen(fen: string): Chess | null {
	const setup = parseFen(fen.trim());
	if (setup.isErr) return null;
	const pos = Chess.fromSetup(setup.value);
	return pos.isOk ? pos.value : null;
}

/** Convert an external UCI string to a legal chessops move (king-takes-rook castling), or null. */
export function uciToMove(pos: Chess, uci: Uci): NormalMove | null {
	const parsed = parseUci(uci);
	if (!parsed || !('from' in parsed)) return null;
	const move = normalizeMove(pos, parsed) as NormalMove;
	if (parsed.promotion) move.promotion = parsed.promotion;
	return pos.isLegal(move) ? move : null;
}

/** Convert a legal chessops move to external UCI (king-two-squares castling). */
export function moveToUci(pos: Chess, move: NormalMove): Uci {
	const side = castlingSide(pos, move);
	if (side) return makeSquare(move.from) + makeSquare(kingCastlesTo(pos.turn, side));
	return cMakeUci(move);
}

/** Every legal move in the position as external UCI. */
export function legalUcis(pos: Chess): Uci[] {
	const out = new Set<Uci>();
	for (const [from, dests] of pos.allDests()) {
		for (const to of dests) {
			const move: NormalMove = { from, to };
			const piece = pos.board.get(from);
			const lastRank = pos.turn === 'white' ? 7 : 0;
			if (piece?.role === 'pawn' && to >> 3 === lastRank) {
				for (const p of ['queen', 'rook', 'bishop', 'knight'] as const) {
					out.add(cMakeUci({ from, to, promotion: p }));
				}
			} else {
				out.add(moveToUci(pos, move));
			}
		}
	}
	return [...out];
}

export function legalDests(fen: string): Map<SquareName, SquareName[]> {
	const result = new Map<SquareName, SquareName[]>();
	const pos = positionFromFen(fen);
	if (!pos) return result;
	for (const [from, dests] of pos.allDests()) {
		const list = new Set<SquareName>();
		for (const to of dests) {
			const uci = moveToUci(pos, { from, to });
			list.add(uci.slice(2, 4));
		}
		if (list.size) result.set(makeSquare(from), [...list]);
	}
	return result;
}

export function applyUci(fen: string, uci: Uci): { fen: string; san: string; uci: Uci } | null {
	const pos = positionFromFen(fen);
	if (!pos) return null;
	const move = uciToMove(pos, uci);
	if (!move) return null;
	const canonical = moveToUci(pos, move);
	const san = makeSan(pos, move);
	pos.play(move);
	return { fen: makeFen(pos.toSetup()), san, uci: canonical };
}

export function makeUci(from: SquareName, to: SquareName, promotion?: PromotionRole): Uci {
	return from + to + (promotion ? roleToChar(promotion) : '');
}

export function isPromotionMove(fen: string, from: SquareName, to: SquareName): boolean {
	const pos = positionFromFen(fen);
	if (!pos) return false;
	const f = parseSquare(from);
	const t = parseSquare(to);
	if (f === undefined || t === undefined) return false;
	const piece = pos.board.get(f);
	if (!piece || piece.role !== 'pawn' || piece.color !== pos.turn) return false;
	if (t >> 3 !== (pos.turn === 'white' ? 7 : 0)) return false;
	return pos.isLegal({ from: f, to: t, promotion: 'queen' });
}

export function sanToUci(fen: string, san: string): Uci | null {
	const pos = positionFromFen(fen);
	if (!pos) return null;
	const move = parseSan(pos, san);
	if (!move || !('from' in move)) return null;
	return moveToUci(pos, move);
}

export function uciToSan(fen: string, uci: Uci): string | null {
	const pos = positionFromFen(fen);
	if (!pos) return null;
	const move = uciToMove(pos, uci);
	return move ? makeSan(pos, move) : null;
}

export function positionStatus(fen: string): PositionStatus {
	const pos = positionFromFen(fen);
	if (!pos) {
		return { turn: turnFromFen(fen), check: false, checkmate: false, stalemate: false, insufficientMaterial: false };
	}
	const ctx = pos.ctx();
	const check = pos.isCheck();
	const king = pos.board.kingOf(pos.turn);
	const status: PositionStatus = {
		turn: pos.turn,
		check,
		checkmate: pos.isCheckmate(ctx),
		stalemate: pos.isStalemate(ctx),
		insufficientMaterial: pos.isInsufficientMaterial(),
	};
	if (check && king !== undefined) status.checkSquare = makeSquare(king);
	const outcome = pos.outcome(ctx);
	if (outcome) status.outcome = { winner: outcome.winner ?? null };
	return status;
}

export function piecesFromFen(fen: string): PieceOnSquare[] {
	const setup = parseFen(fen.trim());
	if (setup.isErr) return [];
	const out: PieceOnSquare[] = [];
	for (const [sq, piece] of setup.value.board) {
		out.push({ square: makeSquare(sq), color: piece.color, role: piece.role });
	}
	return out;
}

export function turnFromFen(fen: string): Color {
	return fen.trim().split(/\s+/)[1] === 'b' ? 'black' : 'white';
}

export function toEpd(fen: string): string {
	return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

export function validateFen(fen: string): boolean {
	return positionFromFen(fen) !== null;
}

function allowsMateIn1(pos: Chess, move: NormalMove): boolean {
	const after = pos.clone();
	after.play(move);
	if (after.isEnd()) return false;
	for (const [from, dests] of after.allDests()) {
		for (const to of dests) {
			const reply = after.clone();
			const piece = reply.board.get(from);
			const promo = piece?.role === 'pawn' && (to >> 3 === 0 || to >> 3 === 7) ? 'queen' : undefined;
			reply.play(promo ? { from, to, promotion: promo } : { from, to });
			if (reply.isCheckmate()) return true;
		}
	}
	return false;
}

/** A random legal move. With `avoidMateIn1`, skips moves that allow mate-in-1 when an alternative exists. */
export function randomLegalMove(
	fen: string,
	rng: () => number = Math.random,
	opts: { avoidMateIn1?: boolean } = {},
): Uci | null {
	const pos = positionFromFen(fen);
	if (!pos) return null;
	let moves = legalUcis(pos);
	if (!moves.length) return null;
	if (opts.avoidMateIn1) {
		const safe = moves.filter((uci) => {
			const m = uciToMove(pos, uci);
			return m !== null && !allowsMateIn1(pos, m);
		});
		if (safe.length) moves = safe;
	}
	const idx = Math.min(moves.length - 1, Math.floor(rng() * moves.length));
	return moves[idx]!;
}

/** True if the last FEN's position (EPD) occurred at least 3 times in `fens`. */
export function isRepetition(fens: string[]): boolean {
	if (!fens.length) return false;
	const last = toEpd(fens[fens.length - 1]!);
	let count = 0;
	for (const f of fens) if (toEpd(f) === last) count++;
	return count >= 3;
}

/** True when the halfmove clock has reached 100 (fifty-move rule). */
export function isFiftyMove(fen: string): boolean {
	const half = Number(fen.trim().split(/\s+/)[4]);
	return Number.isFinite(half) && half >= 100;
}

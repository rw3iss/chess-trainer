/**
 * Maia-2 input encoding / policy decoding (clean-room re-implementation of the
 * format used by CSSLab/maia-platform-frontend @4054a9d1, src/lib/engine/tensor.ts):
 *
 * - `boards` float32 [1,18,8,8]: planes 0–11 = P N B R Q K p n b r q k one-hot,
 *   12 = side to move (always 1 after mirroring), 13–16 = castling K Q k q,
 *   17 = en-passant square. Index = plane*64 + rankIdx*8 + fileIdx (rank 1 = 0).
 * - Black to move: the FEN is mirrored (ranks reversed, colours swapped) so the
 *   model always sees White to move; output moves are mirrored back.
 * - `elo_self` / `elo_oppo` int64 category: <1100 → 0, 1100–1199 → 1 … 1900–1999 → 9, ≥2000 → 10.
 * - `logits_maia` [1,1880] over the `all_moves.json` vocabulary; softmax over legal moves only.
 * - `logits_value` [1] in [-1,1] (side to move); win prob = clamp(v/2 + 0.5, 0, 1).
 */
import type { Uci } from '@chess/core';
import { Chess, castlingSide } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { kingCastlesTo, makeSquare, makeUci } from 'chessops/util';

export const MAIA2_PLANES = 18;
export const MAIA2_ELO_START = 1100;
export const MAIA2_ELO_END = 2000;
const PIECES = 'PNBRQKpnbrqk';

export function eloCategory(elo: number): number {
	if (elo < MAIA2_ELO_START) return 0;
	if (elo >= MAIA2_ELO_END) return 10;
	return Math.floor((elo - MAIA2_ELO_START) / 100) + 1;
}

const swapCase = (s: string): string => s.replace(/[a-zA-Z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));

export function mirrorSquare(sq: string): string {
	return sq[0]! + String(9 - Number(sq[1]));
}

export function mirrorUci(uci: Uci): Uci {
	return mirrorSquare(uci.slice(0, 2)) + mirrorSquare(uci.slice(2, 4)) + uci.slice(4);
}

/** Vertical flip + colour swap; active colour, castling and en passant follow. */
export function mirrorFen(fen: string): string {
	const [board = '', turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
	const ranks = board.split('/').reverse().map(swapCase).join('/');
	let c = '-';
	if (castling !== '-') {
		const sw = swapCase(castling);
		c = ['K', 'Q', 'k', 'q'].filter((x) => sw.includes(x)).join('') || '-';
	}
	return `${ranks} ${turn === 'w' ? 'b' : 'w'} ${c} ${ep === '-' ? '-' : mirrorSquare(ep)} ${half} ${full}`;
}

export function boardToTensor(fen: string): Float32Array {
	const [board = '', turn = 'w', castling = '-', ep = '-'] = fen.trim().split(/\s+/);
	const t = new Float32Array(MAIA2_PLANES * 64);
	const rows = board.split('/');
	for (let r = 0; r < 8; r++) {
		const rankIdx = 7 - r;
		let file = 0;
		for (const ch of rows[r] ?? '') {
			const n = Number.parseInt(ch, 10);
			if (Number.isNaN(n)) {
				const p = PIECES.indexOf(ch);
				if (p >= 0) t[p * 64 + rankIdx * 8 + file] = 1;
				file += 1;
			} else {
				file += n;
			}
		}
	}
	t.fill(turn === 'w' ? 1 : 0, 12 * 64, 13 * 64);
	['K', 'Q', 'k', 'q'].forEach((right, i) => {
		if (castling.includes(right)) t.fill(1, (13 + i) * 64, (14 + i) * 64);
	});
	if (ep !== '-' && ep.length === 2) {
		const file = ep.charCodeAt(0) - 97;
		const rank = Number(ep[1]) - 1;
		t[17 * 64 + rank * 8 + file] = 1;
	}
	return t;
}

function positionFromFen(fen: string): Chess | null {
	const setup = parseFen(fen.trim());
	if (setup.isErr) return null;
	const pos = Chess.fromSetup(setup.value);
	return pos.isOk ? pos.value : null;
}

/** Legal moves as standard UCI (castling = king two squares, all four promotions). */
export function legalUcis(pos: Chess): Uci[] {
	const out: Uci[] = [];
	const lastRank = pos.turn === 'white' ? 7 : 0;
	for (const [from, dests] of pos.allDests()) {
		const piece = pos.board.get(from);
		for (const to of dests) {
			const move = { from, to };
			if (piece?.role === 'pawn' && to >> 3 === lastRank) {
				for (const p of ['queen', 'rook', 'bishop', 'knight'] as const) out.push(makeUci({ from, to, promotion: p }));
				continue;
			}
			const side = castlingSide(pos, move);
			const uci = side ? makeSquare(from) + makeSquare(kingCastlesTo(pos.turn, side)) : makeUci(move);
			if (!out.includes(uci)) out.push(uci);
		}
	}
	return out;
}

export interface MaiaInput {
	boards: Float32Array;
	/** Legal moves in the model's (white-to-move) frame. */
	legalModel: Uci[];
	/** Same moves in the real position's frame. */
	legalReal: Uci[];
	mirrored: boolean;
}

/**
 * Normalises the FEN (en-passant square only when a capture is legal, as
 * python-chess / chess.js emit it), mirrors for Black and encodes.
 */
export function encodePosition(fen: string): MaiaInput {
	const pos = positionFromFen(fen);
	if (!pos) throw new Error(`invalid FEN: ${fen}`);
	const normal = makeFen(pos.toSetup());
	const mirrored = pos.turn === 'black';
	const modelFen = mirrored ? mirrorFen(normal) : normal;
	const modelPos = positionFromFen(modelFen);
	if (!modelPos) throw new Error(`mirror failed: ${modelFen}`);
	const legalModel = legalUcis(modelPos);
	return {
		boards: boardToTensor(modelFen),
		legalModel,
		legalReal: mirrored ? legalModel.map(mirrorUci) : legalModel,
		mirrored,
	};
}

export interface PolicyMove {
	uci: Uci;
	prob: number;
}

/** Softmax over the legal moves' logits; sorted by probability (desc). Moves missing from the vocab are dropped. */
export function decodePolicy(logits: ArrayLike<number>, input: MaiaInput, vocab: Record<string, number>): PolicyMove[] {
	const idx: number[] = [];
	const moves: Uci[] = [];
	input.legalModel.forEach((m, i) => {
		const k = vocab[m];
		if (k !== undefined) {
			idx.push(k);
			moves.push(input.legalReal[i]!);
		}
	});
	if (!idx.length) return [];
	const ls = idx.map((k) => logits[k]!);
	const max = Math.max(...ls);
	const ex = ls.map((l) => Math.exp(l - max));
	const sum = ex.reduce((a, b) => a + b, 0);
	return moves.map((uci, i) => ({ uci, prob: ex[i]! / sum })).sort((a, b) => b.prob - a.prob);
}

/** Side-to-move win probability from the value head. */
export function valueToWinProb(v: number): number {
	return Math.min(1, Math.max(0, v / 2 + 0.5));
}

/** Inverse of the Lichess logistic (core scoreToWinProbability), clamped to ±1500 cp. */
export function winProbToCp(p: number): number {
	const q = Math.min(0.9999, Math.max(0.0001, p));
	return Math.max(-1500, Math.min(1500, Math.round(Math.log(q / (1 - q)) / 0.00368208)));
}

/** Temperature sampling: 0 → argmax; otherwise p^(1/T) renormalised. */
export function sampleMove(policy: PolicyMove[], temperature: number, rng: () => number = Math.random): PolicyMove | undefined {
	if (!policy.length) return undefined;
	if (temperature <= 0) return policy[0];
	const w = policy.map((m) => m.prob ** (1 / temperature));
	const total = w.reduce((a, b) => a + b, 0);
	let r = rng() * total;
	for (let i = 0; i < policy.length; i++) {
		r -= w[i]!;
		if (r <= 0) return policy[i];
	}
	return policy[policy.length - 1];
}

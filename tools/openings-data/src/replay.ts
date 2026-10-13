import { Chess, normalizeMove } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSanAndPlay, parseSan } from 'chessops/san';
import { makeSquare, makeUci, parseUci } from 'chessops/util';
import type { NormalMove } from 'chessops/types';

export interface ReplayedLine {
	uci: string[];
	san: string[];
	/** epds[0] = start position, epds[i] = after ply i. */
	epds: string[];
}

export const epdOfFen = (fen: string): string => fen.split(' ').slice(0, 4).join(' ');

/** Tokenise a PGN-ish move list ('1. e4 e5 2. Nf3' / '1.e4 1...e5'), dropping numbers/results/annotations. */
export function sanTokens(pgn: string): string[] {
	return pgn
		.replace(/\{[^}]*\}/g, ' ')
		.replace(/\([^)]*\)/g, ' ')
		.split(/\s+/)
		.map((t) => t.replace(/^\d+\.+/, '').replace(/[!?]+$/, ''))
		.filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t) && !/^\$\d+$/.test(t));
}

/** Standard UCI: castling as king-two-squares (e1g1), never king-takes-rook. */
function standardUci(pos: Chess, move: NormalMove): string {
	const piece = pos.board.get(move.from);
	if (piece?.role === 'king') {
		const target = pos.board.get(move.to);
		if (target && target.color === piece.color && target.role === 'rook') {
			const rank = Math.floor(move.from / 8);
			const file = move.to > move.from ? 6 : 2;
			return makeSquare(move.from) + makeSquare(rank * 8 + file);
		}
	}
	return makeUci(move);
}

/** Replay SAN moves from the initial position. Returns null on the first illegal / unparsable move. */
export function replaySan(sans: string[]): ReplayedLine | null {
	const pos = Chess.default();
	const out: ReplayedLine = { uci: [], san: [], epds: [epdOfFen(makeFen(pos.toSetup()))] };
	for (const s of sans) {
		const move = parseSan(pos, s);
		if (!move || !('from' in move)) return null;
		out.uci.push(standardUci(pos, move));
		out.san.push(makeSanAndPlay(pos, move));
		out.epds.push(epdOfFen(makeFen(pos.toSetup())));
	}
	return out;
}

/** Replay UCI moves (either castling form) from the initial position. */
export function replayUci(ucis: string[]): ReplayedLine | null {
	const pos = Chess.default();
	const out: ReplayedLine = { uci: [], san: [], epds: [epdOfFen(makeFen(pos.toSetup()))] };
	for (const u of ucis) {
		const parsed = parseUci(u);
		if (!parsed || !('from' in parsed)) return null;
		const move = normalizeMove(pos, parsed) as NormalMove;
		if (!pos.isLegal(move)) return null;
		out.uci.push(standardUci(pos, move));
		out.san.push(makeSanAndPlay(pos, move));
		out.epds.push(epdOfFen(makeFen(pos.toSetup())));
	}
	return out;
}

// Reversible short code for a move line (shareable links for custom lines).
// Each move is stored as its index in the position's legal moves sorted by UCI (< 256), as one
// byte; byte 0 is the format version. The bytes are base64url-encoded (no padding).
// From the standard start position only. ~1.4 characters per move: 20 moves → 28 characters.
import { positionFromFen, legalUcis, uciToMove } from './position.js';
import { INITIAL_FEN, type Uci } from './types.js';

const VERSION = 1;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toB64(bytes: number[]): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
		const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
		for (let k = 0; k < chars; k++) out += B64[(n >> (18 - 6 * k)) & 63];
	}
	return out;
}

function fromB64(s: string): number[] | null {
	const bytes: number[] = [];
	for (let i = 0; i < s.length; i += 4) {
		const chunk = s.slice(i, i + 4);
		if (chunk.length === 1) return null;
		let n = 0;
		for (let k = 0; k < 4; k++) {
			const v = k < chunk.length ? B64.indexOf(chunk[k]!) : 0;
			if (v < 0) return null;
			n = (n << 6) | v;
		}
		bytes.push((n >> 16) & 255);
		if (chunk.length > 2) bytes.push((n >> 8) & 255);
		if (chunk.length > 3) bytes.push(n & 255);
	}
	return bytes;
}

/** Code for a legal UCI line from the start position; null if a move is illegal. */
export function encodeLine(uci: readonly Uci[]): string | null {
	const pos = positionFromFen(INITIAL_FEN)!;
	const bytes = [VERSION];
	for (const u of uci) {
		const legal = legalUcis(pos).sort();
		const i = legal.indexOf(u);
		const move = i >= 0 ? uciToMove(pos, u) : null;
		if (!move) return null;
		bytes.push(i);
		pos.play(move);
	}
	return toB64(bytes);
}

/** The UCI line for a code; null when the code is malformed or names an illegal move. */
export function decodeLine(code: string): Uci[] | null {
	if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
	const bytes = fromB64(code);
	if (!bytes || bytes[0] !== VERSION) return null;
	const pos = positionFromFen(INITIAL_FEN)!;
	const out: Uci[] = [];
	for (const b of bytes.slice(1)) {
		const u = legalUcis(pos).sort()[b];
		const move = u ? uciToMove(pos, u) : null;
		if (!u || !move) return null;
		out.push(u);
		pos.play(move);
	}
	return out;
}

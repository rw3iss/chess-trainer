import type { Uci } from '../chess/types.js';

/**
 * Stable short id for an opening line: cyrb53 hash of the space-joined UCI moves, base36.
 * Pure, deterministic and platform-independent, so ids survive dataset rebuilds.
 */
export function openingId(uci: Uci[]): string {
	const str = uci.join(' ');
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
	return n.toString(36).padStart(11, '0');
}

/** Split 'Family: Variation, Sub' into family (before the first ':') and variation (after). */
export function splitName(name: string): { family: string; variation?: string } {
	const i = name.indexOf(':');
	if (i < 0) return { family: name.trim() };
	const family = name.slice(0, i).trim();
	const variation = name.slice(i + 1).trim();
	return variation ? { family, variation } : { family };
}

/** First 4 FEN fields (board, turn, castling, ep). Accepts a FEN or an EPD. */
export function epdOf(fenOrEpd: string): string {
	return fenOrEpd.trim().split(/\s+/).slice(0, 4).join(' ');
}

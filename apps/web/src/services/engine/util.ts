import { applyUci, type EnginePosition } from '@chess/core';

/** FEN after playing `pos.moves` from `pos.fen`. Null if a move is illegal. */
export function fenAfter(pos: EnginePosition): string | null {
	let fen = pos.fen;
	for (const uci of pos.moves) {
		const next = applyUci(fen, uci);
		if (!next) return null;
		fen = next.fen;
	}
	return fen;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** Waits until at least `minMs` have elapsed since `startedAt`. */
export async function waitMinDelay(startedAt: number, minMs: number, now: () => number = Date.now): Promise<void> {
	const left = minMs - (now() - startedAt);
	if (left > 0) await sleep(left);
}

/** Absolute URL for a file under `public/engines/` (respects Vite's BASE_URL). */
export function engineAssetUrl(path: string): string {
	const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
	const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost';
	return new URL(`${base.replace(/\/?$/, '/')}engines/${path}`, origin).href;
}

// Pure formatting helpers (no Preact imports).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** '3 min ago', '2 h ago', 'yesterday', '12 Oct'. */
export function formatRelativeTime(ts: number, now = Date.now()): string {
	const diff = Math.max(0, now - ts);
	if (diff < MINUTE) return 'just now';
	if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
	if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
	if (diff < 2 * DAY) return 'yesterday';
	if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`;
	return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Move number label for a ply (1-based ply of the move itself): ply 1 → '1.', ply 2 → '1…'. */
export function moveNumberLabel(ply: number): string {
	const n = Math.ceil(ply / 2);
	return ply % 2 === 1 ? `${n}.` : `${n}…`;
}

const FIGURINES: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };

/** Replace the leading piece letter of a SAN with a unicode figurine (Nf3 → ♘f3). */
export function figurineSan(san: string): string {
	return san.replace(/[KQRBN]/g, (m, i: number) => (i === 0 || san[i - 1] === '=' ? FIGURINES[m] : m));
}

/** 'last move' description e.g. '12. Nf3' / '12… Nf6'. */
export function describeMove(ply: number, san: string): string {
	return `${moveNumberLabel(ply)} ${san}`;
}

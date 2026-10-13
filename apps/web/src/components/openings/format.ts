// Pure display helpers for opening lines.

/** '1.e4 c5 2.Nf3 d6' — numbered SAN line (first `limit` plies). */
export function sanLine(san: readonly string[], limit = san.length): string {
	const parts: string[] = [];
	const n = Math.min(limit, san.length);
	for (let i = 0; i < n; i++) parts.push(i % 2 === 0 ? `${i / 2 + 1}.${san[i]}` : san[i]!);
	return parts.join(' ');
}

/** Label for the position after `ply` plies: 0 → 'Start', 3 → '2.Nf3', 4 → '2…Nc6'. */
export function plyLabel(san: readonly string[], ply: number): string {
	if (ply <= 0) return 'Start';
	const n = Math.ceil(ply / 2);
	return `${n}${ply % 2 === 1 ? '.' : '…'}${san[ply - 1] ?? ''}`;
}

/** 1234 → '1.2k', 2_300_000 → '2.3M'. */
export function compactCount(n: number): string {
	if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
	return String(n);
}

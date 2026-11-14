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

/** Numbered SAN from ply `from` (0-based): from=4 → '3.d4 cxd4', from=5 → '3…cxd4 4.Nxd4'. */
export function sanLineFrom(san: readonly string[], from: number, limit = san.length - from): string {
	const parts: string[] = [];
	const end = Math.min(san.length, from + limit);
	for (let i = from; i < end; i++) {
		const n = Math.floor(i / 2) + 1;
		if (i % 2 === 0) parts.push(`${n}.${san[i]}`);
		else parts.push(i === from ? `${n}…${san[i]}` : san[i]!);
	}
	return parts.join(' ');
}

/** Name of `child` relative to `parent`: 'Sicilian Defense: Najdorf Variation, English Attack' under '…Najdorf Variation' → 'English Attack'. Empty when the names match. */
export function relativeName(child: string, parent: string | undefined): string {
	if (!parent || child === parent) return parent ? '' : child;
	if (child.startsWith(parent)) return child.slice(parent.length).replace(/^[\s,:]+/, '');
	const colon = child.indexOf(':');
	return colon > 0 && parent.startsWith(child.slice(0, colon)) ? child.slice(colon + 1).trim() : child;
}

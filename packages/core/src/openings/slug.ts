import type { OpeningEntry } from './types.js';

/** URL slug for a name: "King's Gambit: Muzio Gambit" → "kings-gambit-muzio-gambit". */
export function slugify(name: string): string {
	return (
		name
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/['’`]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 90)
			.replace(/-+$/, '') || 'opening'
	);
}

const SOURCE_RANK: Record<string, number> = { lichess: 0, 'eco.json': 1, scid: 2, wikibooks: 3 };

/**
 * Unique slug per opening (id → slug). Openings that share a name get "-2", "-3", … in a fixed
 * order (Lichess first, then shorter lines, then by moves), so the main line keeps the plain slug.
 */
export function assignSlugs(entries: readonly Pick<OpeningEntry, 'id' | 'name' | 'source' | 'plies' | 'uci'>[]): Map<string, string> {
	const rank = (s: string) => SOURCE_RANK[s] ?? 9;
	const sorted = [...entries].sort((a, b) => rank(a.source) - rank(b.source) || a.plies - b.plies || (a.uci.join(' ') < b.uci.join(' ') ? -1 : 1));
	const used = new Set<string>();
	const out = new Map<string, string>();
	for (const e of sorted) {
		const base = slugify(e.name);
		let slug = base;
		for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
		used.add(slug);
		out.set(e.id, slug);
	}
	return out;
}

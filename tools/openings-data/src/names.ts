// Opening-name rules shared by the merge: spelling-insensitive keys, move-text detection and
// canonical names (Lichess style "Family: Variation, Sub-variation", American spelling).

/** Key that ignores case, accents, punctuation and Defence/Defense: equal keys = the same name spelled differently. */
export function nameKey(name: string): string {
	// Grünfeld = Grunfeld = Gruenfeld, Sämisch = Saemisch: drop accents, then fold ae/oe/ue (both sides alike).
	return name
		.replace(/ß/g, 'ss')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/defence/g, 'defense')
		.replace(/(?<=[a-z])([aou])e/g, '$1')
		.replace(/['’`"]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** True when the name spells out moves ("Sicilian: Najdorf, 6.Bg5 e6") instead of naming them. */
export function hasMoveText(name: string): boolean {
	return (
		/\b\d+\s*\.(?:\.\.)?\s*(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|O-O)/i.test(name) ||
		/\.\.\.\s*[KQRBNa-h]/.test(name) ||
		/\b(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|[a-h][1-8])\b/.test(name)
	);
}

const ABBREVIATIONS: [RegExp, string][] = [
	[/\bKGD\b/g, "King's Gambit Declined"],
	[/\bKGA\b/g, "King's Gambit Accepted"],
	[/\bQGD\b/g, "Queen's Gambit Declined"],
	[/\bQGA\b/g, "Queen's Gambit Accepted"],
	[/\bKID\b/g, "King's Indian Defense"],
	[/\bQID\b/g, "Queen's Indian Defense"],
	[/\bBDG\b/g, 'Blackmar-Diemer Gambit'],
];

/** Raw name cleanup: wiki template leftovers ("Name="), trailing "; ECO" notes, " - " as the family separator, abbreviations. */
export function cleanName(raw: string): string {
	let n = raw
		.replace(/\bname\s*=\s*/gi, '')
		.replace(/\s*;.*$/, '')
		.replace(/\s*\([^)]*\)/g, '')
		.replace(/[–—]/g, '-')
		.replace(/\s+/g, ' ')
		.trim();
	if (!n.includes(':')) n = n.replace(' - ', ': ');
	for (const [re, full] of ABBREVIATIONS) n = n.replace(re, full);
	return n;
}

const NOISE_WORDS = new Set(['variation', 'line', 'the', 'of', 'and', 'with']);

/**
 * True when `alias` says nothing beyond `primary`: every word of it (ignoring "variation", "line"…)
 * is a word of the primary name or the start of one — a parent name ("French Defense: Tarrasch
 * Variation"), an abbreviation ("Catalan: Open") or a reordering ("Lucena Defense: Ruy Lopez").
 */
export function isRedundantAlias(alias: string, primary: string): boolean {
	const p = nameKey(primary).split(' ');
	const words = nameKey(alias)
		.split(' ')
		.filter((w) => w && !NOISE_WORDS.has(w));
	return words.every((w) => p.some((x) => x.startsWith(w)));
}

const SMALL_WORDS = new Set(['of', 'the', 'and', 'de', 'del', 'da', 'di', 'von', 'van', 'der', 'in', 'on', 'for', 'with', 'vs']);

/** Capitalize all-lowercase words ("English attack" → "English Attack"); small words stay lower except first. */
export function titleCase(name: string): string {
	return name
		.split(' ')
		.map((w, i) => {
			// Leave move text (e4, Nf3, 6.Bg5), mixed-case words and small words alone.
			if (/\d/.test(w) || w !== w.toLowerCase() || !/^\p{L}/u.test(w)) return w;
			if (i > 0 && SMALL_WORDS.has(w)) return w;
			return w[0]!.toUpperCase() + w.slice(1);
		})
		.join(' ');
}

/**
 * Canonical form of a non-Lichess name: American spelling, "Family, Variation" → "Family: Variation",
 * Title Case, a short family ("Sicilian") expanded to the family of the opening it extends ("Sicilian Defense"),
 * and a bare variation name put under that opening ("Sicilian Defense: Najdorf Variation, English Attack").
 * `families` = name keys of known opening families.
 */
export function canonicalName(raw: string, ancestor?: { name: string; family: string }, families?: Set<string>): string {
	const ancestorFamily = ancestor?.family;
	let n = titleCase(cleanName(raw).replace(/\bDefence\b/g, 'Defense').replace(/\bCentre\b/g, 'Center').replace(/\bdefence\b/g, 'defense'));
	if (!n.includes(':')) {
		const comma = n.indexOf(', ');
		if (comma > 0 && !hasMoveText(n.slice(0, comma))) n = n.slice(0, comma) + ': ' + n.slice(comma + 2);
	}
	if (ancestorFamily) {
		const colon = n.indexOf(':');
		const fam = colon > 0 ? n.slice(0, colon) : n;
		if (fam !== ancestorFamily && ancestorFamily.toLowerCase().startsWith(fam.toLowerCase() + ' ')) n = ancestorFamily + n.slice(fam.length);
	}
	// A bare variation name ("English Attack") that is not itself an opening family hangs under the opening it extends.
	if (ancestor && !n.includes(':') && !n.includes(',') && families && !families.has(nameKey(n)) && nameKey(n) !== nameKey(ancestor.name)) {
		// Under the ancestor's name, or just its family when that name is move text ("Barnes Opening: 1... e5").
		const base = hasMoveText(ancestor.name) ? ancestor.family : ancestor.name;
		n = `${base}${base.includes(':') ? ', ' : ': '}${n}`;
	}
	return n;
}

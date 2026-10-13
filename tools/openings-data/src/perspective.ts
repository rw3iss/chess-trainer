import type { Color } from '../../../packages/core/src/chess/types.js';

/**
 * Manual overrides, matched against the full name by prefix (longest prefix wins).
 * Use for lines the keyword heuristic gets wrong.
 */
export const PERSPECTIVE_OVERRIDES: Record<string, Color> = {
	"Queen's Gambit Accepted": 'black',
	"Queen's Gambit Declined": 'black',
	"King's Gambit Accepted": 'black',
	"King's Gambit Declined": 'black',
	'Englund Gambit Declined': 'white',
	'Latvian Gambit Accepted': 'white',
	'Elephant Gambit': 'black',
	'Englund Gambit': 'black',
	'Latvian Gambit': 'black',
	'Budapest Defense': 'black',
	'Benko Gambit': 'black',
	'Blackmar-Diemer Gambit': 'white',
	'Ruy Lopez': 'white',
	'Italian Game': 'white',
	'Scotch Game': 'white',
	'Vienna Game': 'white',
	'Bishop\'s Opening': 'white',
	'Ponziani Opening': 'white',
	'Four Knights Game': 'white',
	'Three Knights Opening': 'white',
	'Indian Defense': 'black',
	'Modern Defense': 'black',
	'Hedgehog Defense': 'black',
	'Hippopotamus Defense': 'black',
	'Mieses Opening': 'white',
	"Queen's Pawn Game": 'white',
};

const BLACK_WORDS = /\b(Countergambit|Counter-Gambit|Defen[cs]e)\b/i;
const ACCEPT_WORDS = /\b(Accepted|Declined)\b/i;
const WHITE_WORDS = /\b(Attack|Opening|Game|System)\b/i;
const GAMBIT = /\bGambit\b/i;

function overrideKey(name: string): string | undefined {
	let best: string | undefined;
	for (const k of Object.keys(PERSPECTIVE_OVERRIDES)) {
		if (name.startsWith(k) && (!best || k.length > best.length)) best = k;
	}
	return best;
}

function overrideFor(name: string): Color | undefined {
	const k = overrideKey(name);
	return k ? PERSPECTIVE_OVERRIDES[k] : undefined;
}

/** Side the line is "for". Override table → variation keywords → family keywords → side that made the last move. */
export function perspectiveFor(name: string, plies: number): Color {
	const lastMover: Color = plies % 2 === 1 ? 'white' : 'black';
	const i = name.indexOf(':');
	const family = (i < 0 ? name : name.slice(0, i)).trim();
	const variation = i < 0 ? '' : name.slice(i + 1).trim();

	const familyColor = (): Color => {
		const o = overrideFor(family);
		if (o) return o;
		if (BLACK_WORDS.test(family)) return 'black';
		if (GAMBIT.test(family) && ACCEPT_WORDS.test(family)) return 'black';
		if (WHITE_WORDS.test(family)) return 'white';
		return lastMover;
	};

	// An override that reaches into the variation (e.g. "Englund Gambit Declined") beats everything.
	const full = overrideKey(name);
	if (full && full.length > family.length) return PERSPECTIVE_OVERRIDES[full]!;
	if (variation) {
		// Variation keywords only flip/decide inside a family when they are explicit about a side.
		const firstPart = variation.split(',')[0]!;
		if (BLACK_WORDS.test(firstPart)) return 'black';
		if (GAMBIT.test(firstPart) && ACCEPT_WORDS.test(firstPart)) return familyColor();
		if (GAMBIT.test(firstPart)) return lastMover;
		if (/\bAttack\b/i.test(firstPart)) return 'white';
	}
	return familyColor();
}

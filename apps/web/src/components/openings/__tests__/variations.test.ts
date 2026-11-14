import { describe, expect, it } from 'vitest';
import { relativeName, sanLineFrom } from '../format';
import { collapseLineage, keptPly } from '../OpeningVariations';
import { ROOT_ID, mainline, treeFromUci } from '@chess/core/chess';
import { createSession } from '@chess/core/game';
import type { OpeningEntry } from '@chess/core/openings';

describe('sanLineFrom', () => {
	const san = ['e4', 'c5', 'Nf3', 'd6', 'd4'];
	it('numbers from a white ply', () => expect(sanLineFrom(san, 2)).toBe('2.Nf3 d6 3.d4'));
	it('numbers from a black ply', () => expect(sanLineFrom(san, 3)).toBe('2…d6 3.d4'));
	it('limits plies', () => expect(sanLineFrom(san, 0, 2)).toBe('1.e4 c5'));
});

describe('relativeName', () => {
	it('strips the parent name', () => {
		expect(relativeName('Sicilian Defense: Najdorf Variation, English Attack', 'Sicilian Defense: Najdorf Variation')).toBe('English Attack');
		expect(relativeName('Sicilian Defense: Najdorf Variation', 'Sicilian Defense')).toBe('Najdorf Variation');
	});
	it('is empty for the same name, full name for a new family', () => {
		expect(relativeName('Sicilian Defense', 'Sicilian Defense')).toBe('');
		expect(relativeName('Caro-Kann Defense', "King's Pawn Game")).toBe('Caro-Kann Defense');
	});
});

describe('collapseLineage', () => {
	const e = (id: string, name: string, source = 'lichess') => ({ id, name, source }) as OpeningEntry;
	it('keeps each name once (first), in order', () => {
		expect(collapseLineage([e('a', 'KPG'), e('b', 'Sicilian'), e('c', 'Open'), e('d', 'Sicilian')]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
	});
	it('prefers Lichess-named openings when there are any', () => {
		expect(collapseLineage([e('a', 'KPG'), e('b', 'Sicilian: Modern', 'eco.json'), e('c', 'Sicilian')]).map((x) => x.id)).toEqual(['a', 'c']);
		expect(collapseLineage([e('x', 'Only', 'eco.json')]).map((x) => x.id)).toEqual(['x']);
	});
});

describe('keptPly', () => {
	const entry = (uci: string[]) => ({ uci }) as OpeningEntry;
	const sessionAt = (moves: string[], ply: number) => {
		const s = createSession({ tree: treeFromUci(moves) });
		return { ...s, cursor: ply === 0 ? ROOT_ID : mainline(s.tree)[ply - 1]!.id };
	};
	const base = ['e2e4', 'c7c5', 'g1f3', 'd7d6'];

	it('keeps the cursor ply when the new line extends the current position', () => {
		expect(keptPly(sessionAt(base, 3), entry([...base, 'd2d4']))).toBe(3);
		expect(keptPly(sessionAt(base, 0), entry([...base, 'd2d4']))).toBe(0);
		expect(keptPly(sessionAt(base, 4), entry([...base, 'd2d4']))).toBe(4);
	});

	it('falls back to the last shared move when the lines differ', () => {
		expect(keptPly(sessionAt(base, 4), entry(['e2e4', 'c7c5', 'b1c3']))).toBe(2);
	});
});

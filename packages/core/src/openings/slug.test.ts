import { describe, expect, it } from 'vitest';
import { assignSlugs, slugify } from './slug.js';
import { decodeLine, encodeLine } from '../chess/lineCode.js';

describe('slugify / assignSlugs', () => {
	it('makes URL-safe slugs', () => {
		expect(slugify("King's Gambit Accepted: Muzio Gambit")).toBe('kings-gambit-accepted-muzio-gambit');
		expect(slugify('Grünfeld Defense: Exchange Variation, 7…c5')).toBe('grunfeld-defense-exchange-variation-7-c5');
		expect(slugify('???')).toBe('opening');
	});
	it('numbers repeated names; Lichess and shorter lines keep the plain slug', () => {
		const e = (id: string, source: string, plies: number) => ({ id, name: 'Sicilian Defense: Najdorf Variation', source, plies, uci: Array(plies).fill('e2e4') });
		const m = assignSlugs([e('c', 'eco.json', 10), e('b', 'lichess', 11), e('a', 'lichess', 10)]);
		expect([m.get('a'), m.get('b'), m.get('c')]).toEqual(['sicilian-defense-najdorf-variation', 'sicilian-defense-najdorf-variation-2', 'sicilian-defense-najdorf-variation-3']);
	});
});

describe('encodeLine / decodeLine', () => {
	it('round-trips lines incl. castling and promotion', () => {
		const lines = [
			[],
			['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6'],
			['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1'],
			['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6b7', 'g8f6', 'b7a8q'],
		];
		for (const l of lines) {
			const code = encodeLine(l)!;
			expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
			expect(decodeLine(code)).toEqual(l);
		}
		expect(encodeLine(lines[1]!)!.length).toBeLessThanOrEqual(16);
	});
	it('rejects illegal lines and malformed codes', () => {
		expect(encodeLine(['e2e5'])).toBeNull();
		expect(decodeLine('not a code!')).toBeNull();
		expect(decodeLine('A')).toBeNull();
		expect(decodeLine('Av__')).toBeNull(); // version 2 / out-of-range index
	});
});

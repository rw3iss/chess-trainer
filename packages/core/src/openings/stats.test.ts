import { describe, expect, it } from 'vitest';
import { statsFor, statsScore } from './stats.js';

describe('statsFor / statsScore', () => {
	const li = { games: 1000, white: 50, draws: 20, black: 30, score: 80 };
	const ma = { games: 40, white: 40, draws: 40, black: 20, score: 60 };
	it('returns one provider at a time, never mixed', () => {
		expect(statsFor({ popularity: { ...li, masters: ma } }, 'lichess')).toMatchObject(li);
		expect(statsFor({ popularity: { ...li, masters: ma } }, 'masters')).toEqual(ma);
		expect(statsFor({ popularity: li }, 'masters')).toBeUndefined();
		expect(statsFor({}, 'lichess')).toBeUndefined();
	});
	it('score is -1 when unknown', () => {
		expect(statsScore({ popularity: { ...li, masters: ma } }, 'masters')).toBe(60);
		expect(statsScore({ popularity: li }, 'masters')).toBe(-1);
	});
});

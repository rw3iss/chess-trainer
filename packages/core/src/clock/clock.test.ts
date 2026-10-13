import { describe, expect, it } from 'vitest';
import {
	CLOCK_PRESETS,
	checkFlag,
	createClock,
	formatClock,
	isLowTime,
	pauseClock,
	pressClock,
	remainingAt,
	resumeClock,
	startClock,
} from './clock.js';

const MIN = 60_000;

describe('clock', () => {
	it('presets', () => {
		expect(CLOCK_PRESETS.map((p) => p.id)).toEqual([
			'1+0', '2+1', '3+0', '3+2', '5+0', '5+3', '10+0', '10+5', '15+10', '30+0', '30+20',
		]);
		expect(CLOCK_PRESETS[3]!.config).toEqual({ initialMs: 3 * MIN, incrementMs: 2000 });
	});

	it('create / start / remaining', () => {
		const c = createClock({ initialMs: 5 * MIN, incrementMs: 0 });
		expect(c).toMatchObject({ running: null, flagged: null, toMove: 'white', remaining: { white: 5 * MIN, black: 5 * MIN } });
		const s = startClock(c, 1000);
		expect(s.running).toBe('white');
		expect(remainingAt(s, 'white', 4000)).toBe(5 * MIN - 3000);
		expect(remainingAt(s, 'black', 4000)).toBe(5 * MIN);
		expect(startClock(s, 2000)).toBe(s);
	});

	it('press adds increment and switches sides', () => {
		let c = startClock(createClock({ initialMs: 3 * MIN, incrementMs: 2000 }), 0);
		c = pressClock(c, 10_000);
		expect(c.remaining.white).toBe(3 * MIN - 10_000 + 2000);
		expect(c.running).toBe('black');
		expect(c.toMove).toBe('black');
		c = pressClock(c, 15_000);
		expect(c.remaining.black).toBe(3 * MIN - 5000 + 2000);
		expect(c.running).toBe('white');
	});

	it('press when not started starts the opponent without increment', () => {
		const c = pressClock(createClock({ initialMs: MIN, incrementMs: 1000 }), 500);
		expect(c.remaining.white).toBe(MIN);
		expect(c.running).toBe('black');
		expect(c.lastStartedAt).toBe(500);
	});

	it('simple delay: no countdown during delay, not banked', () => {
		let c = startClock(createClock({ initialMs: MIN, incrementMs: 0, delayMs: 3000 }), 0);
		expect(remainingAt(c, 'white', 2000)).toBe(MIN);
		expect(remainingAt(c, 'white', 5000)).toBe(MIN - 2000);
		c = pressClock(c, 2000);
		expect(c.remaining.white).toBe(MIN);
		expect(c.delayRemaining).toBe(3000);
		expect(remainingAt(c, 'black', 4000)).toBe(MIN);
	});

	it('delay survives pause/resume within a turn', () => {
		let c = startClock(createClock({ initialMs: MIN, incrementMs: 0, delayMs: 3000 }), 0);
		c = pauseClock(c, 1000);
		expect(c.running).toBeNull();
		expect(c.delayRemaining).toBe(2000);
		expect(c.remaining.white).toBe(MIN);
		c = resumeClock(c, 50_000);
		expect(c.running).toBe('white');
		expect(remainingAt(c, 'white', 55_000)).toBe(MIN - 3000);
	});

	it('pause / resume keeps time and side', () => {
		let c = startClock(createClock({ initialMs: MIN, incrementMs: 0 }), 0);
		c = pressClock(c, 1000);
		c = pauseClock(c, 6000);
		expect(c).toMatchObject({ running: null, toMove: 'black', lastStartedAt: null });
		expect(c.remaining.black).toBe(MIN - 5000);
		expect(remainingAt(c, 'black', 99_999)).toBe(MIN - 5000);
		expect(pauseClock(c, 7000)).toBe(c);
		c = resumeClock(c, 100_000);
		expect(c.running).toBe('black');
		expect(remainingAt(c, 'black', 101_000)).toBe(MIN - 6000);
	});

	it('flag detection', () => {
		let c = startClock(createClock({ initialMs: 1000, incrementMs: 0 }), 0);
		expect(checkFlag(c, 999)).toBe(c);
		const f = checkFlag(c, 1000);
		expect(f.flagged).toBe('white');
		expect(f.running).toBeNull();
		expect(f.remaining.white).toBe(0);
		expect(pressClock(f, 2000)).toBe(f);
		expect(resumeClock(f, 2000)).toBe(f);
		// Pressing after the time ran out flags instead of adding increment.
		c = startClock(createClock({ initialMs: 1000, incrementMs: 5000 }), 0);
		const p = pressClock(c, 1500);
		expect(p.flagged).toBe('white');
		expect(p.remaining.white).toBe(0);
		// Pausing after expiry also flags.
		expect(pauseClock(c, 2000).flagged).toBe('white');
	});

	it('isLowTime', () => {
		const c = startClock(createClock({ initialMs: 20_000, incrementMs: 0 }), 0);
		expect(isLowTime(c, 'white', 5000, 10_000)).toBe(false);
		expect(isLowTime(c, 'white', 10_001, 10_000)).toBe(true);
		expect(isLowTime(c, 'black', 19_000, 10_000)).toBe(false);
	});

	it('formatClock', () => {
		expect(formatClock(299_999)).toBe('4:59');
		expect(formatClock(300_000)).toBe('5:00');
		expect(formatClock(9300)).toBe('0:09.3');
		expect(formatClock(10_000)).toBe('0:10');
		expect(formatClock(3_723_000)).toBe('1:02:03');
		expect(formatClock(-5)).toBe('0:00.0');
		expect(formatClock(9300, { tenthsUnderMs: 0 })).toBe('0:09');
		expect(formatClock(59_900, { tenthsUnderMs: 60_000 })).toBe('0:59.9');
	});
});

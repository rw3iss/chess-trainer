import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClock } from '@chess/core/clock';
import { createSession, sessionMove, type Session } from '@chess/core/game';
import { ClockController, CLOCK_TICK_MS, type ClockControllerDeps } from '../ClockController';
import { CUSTOM_PRESET_ID, clockCategory, describeClockConfig, resolveClockConfig } from '../clockConfig';

const MIN = 60_000;

/** In-memory harness: a sessions list + subscribers, driven by fake timers. */
function harness(initial: Session[], opts: { pauseOnHidden?: boolean; lowTimeMs?: number } = {}) {
	let sessions = initial;
	let active: string | null = initial[0]?.id ?? null;
	let hidden = false;
	const subs = new Set<() => void>();
	const visSubs = new Set<() => void>();
	const notify = () => subs.forEach((f) => f());
	const onLowTime = vi.fn();
	const onFlag = vi.fn();
	const deps: ClockControllerDeps = {
		now: () => Date.now(),
		sessions: () => sessions,
		activeId: () => active,
		update: (id, patch) => {
			sessions = sessions.map((s) => (s.id === id ? { ...s, ...patch } : s));
			notify();
		},
		subscribe: (fn) => {
			subs.add(fn);
			return () => subs.delete(fn);
		},
		settings: () => ({ pauseOnHidden: opts.pauseOnHidden ?? true, lowTimeMs: opts.lowTimeMs ?? 10_000 }),
		visibility: {
			hidden: () => hidden,
			subscribe: (fn) => {
				visSubs.add(fn);
				return () => visSubs.delete(fn);
			},
		},
		onLowTime,
		onFlag,
	};
	const ctl = new ClockController(deps);
	return {
		ctl,
		onLowTime,
		onFlag,
		get: (id: string) => sessions.find((s) => s.id === id)!,
		move(id: string, uci: string) {
			sessions = sessions.map((s) => (s.id === id ? sessionMove(s, uci)! : s));
			notify();
		},
		setActive(id: string | null) {
			active = id;
			notify();
		},
		setHidden(h: boolean) {
			hidden = h;
			visSubs.forEach((f) => f());
		},
		patch(id: string, p: Partial<Session>) {
			deps.update(id, p);
		},
	};
}

function pvp(id: string, initialMs = MIN, incrementMs = 0, delayMs?: number): Session {
	return { ...createSession({ id, mode: 'local-pvp', now: 0 }), clock: createClock({ initialMs, incrementMs, delayMs }) };
}

describe('ClockController', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});
	afterEach(() => vi.useRealTimers());

	it('first move starts the opponent clock; later moves press with increment', () => {
		const h = harness([pvp('a', 3 * MIN, 2000)]);
		h.ctl.start();
		h.move('a', 'e2e4');
		expect(h.get('a').clock).toMatchObject({ running: 'black', remaining: { white: 3 * MIN, black: 3 * MIN } });
		vi.advanceTimersByTime(5000);
		h.move('a', 'e7e5');
		const c = h.get('a').clock!;
		expect(c.running).toBe('white');
		expect(c.remaining.black).toBe(3 * MIN - 5000 + 2000);
		h.ctl.stop();
	});

	it('ticks only while a clock runs and publishes now', () => {
		const h = harness([pvp('a')]);
		h.ctl.start();
		expect(vi.getTimerCount()).toBe(0);
		h.move('a', 'e2e4');
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(CLOCK_TICK_MS * 3);
		expect(h.ctl.now.value).toBe(CLOCK_TICK_MS * 3);
		h.ctl.pause('a');
		expect(vi.getTimerCount()).toBe(0);
		expect(h.ctl.isPaused(h.get('a'))).toBe(true);
		h.ctl.resume('a');
		expect(h.get('a').clock!.running).toBe('black');
		h.ctl.stop();
	});

	it('flag → clock flagged + timeout result for the opponent', () => {
		const h = harness([pvp('a', 2000)]);
		h.ctl.start();
		h.move('a', 'e2e4'); // black's clock runs
		vi.advanceTimersByTime(2100);
		const s = h.get('a');
		expect(s.clock!.flagged).toBe('black');
		expect(s.result).toEqual({ winner: 'white', reason: 'timeout' });
		expect(h.onFlag).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
		// Further moves don't press a flagged clock.
		h.move('a', 'e7e5');
		expect(h.get('a').clock!.flagged).toBe('black');
	});

	it('low-time warning fires once per crossing', () => {
		const h = harness([pvp('a', 12_000)], { lowTimeMs: 10_000 });
		h.ctl.start();
		h.move('a', 'e2e4');
		vi.advanceTimersByTime(1000);
		expect(h.onLowTime).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1500);
		expect(h.onLowTime).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(3000);
		expect(h.onLowTime).toHaveBeenCalledTimes(1);
		h.ctl.stop();
	});

	it('pauses on game end (mate / resign)', () => {
		const h = harness([pvp('a')]);
		h.ctl.start();
		h.move('a', 'f2f3');
		h.move('a', 'e7e5');
		h.move('a', 'g2g4');
		vi.advanceTimersByTime(1000);
		h.move('a', 'd8h4'); // fool's mate
		const s = h.get('a');
		expect(s.result?.reason).toBe('checkmate');
		expect(s.clock!.running).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('pauses on hidden tab and resumes on visible (setting on)', () => {
		const h = harness([pvp('a')]);
		h.ctl.start();
		h.move('a', 'e2e4');
		vi.advanceTimersByTime(1000);
		h.setHidden(true);
		expect(h.get('a').clock!.running).toBeNull();
		vi.advanceTimersByTime(30_000);
		h.setHidden(false);
		const c = h.get('a').clock!;
		expect(c.running).toBe('black');
		expect(c.remaining.black).toBe(MIN - 1000);
		h.ctl.stop();
	});

	it('keeps running on hidden tab when the setting is off', () => {
		const h = harness([pvp('a')], { pauseOnHidden: false });
		h.ctl.start();
		h.move('a', 'e2e4');
		h.setHidden(true);
		expect(h.get('a').clock!.running).toBe('black');
		h.ctl.stop();
	});

	it('parks an inactive local game and resumes it when re-activated', () => {
		const h = harness([pvp('a'), { ...createSession({ id: 'b', now: 0 }) }]);
		h.ctl.start();
		h.move('a', 'e2e4');
		h.setActive('b');
		expect(h.get('a').clock!.running).toBeNull();
		h.setActive('a');
		expect(h.get('a').clock!.running).toBe('black');
		h.ctl.stop();
	});

	it('parks clocks restored as running (page was closed mid-game)', () => {
		const s = pvp('a');
		const running = { ...s, clock: { ...s.clock!, running: 'white' as const, lastStartedAt: -50_000 } };
		const h = harness([running]);
		h.ctl.start();
		expect(h.get('a').clock).toMatchObject({ running: null, toMove: 'white', remaining: { white: MIN } });
		h.ctl.stop();
	});

	it('ignores online sessions', () => {
		const s = { ...pvp('a'), mode: 'online' as const };
		const h = harness([s]);
		h.ctl.start();
		h.move('a', 'e2e4');
		expect(h.get('a').clock!.running).toBeNull();
		h.ctl.stop();
	});
});

describe('clockConfig', () => {
	it('resolves presets, custom and delay', () => {
		expect(resolveClockConfig({ presetId: '3+2', custom: { initialMs: 1, incrementMs: 0 }, delayMs: 0 })).toEqual({ initialMs: 3 * MIN, incrementMs: 2000 });
		expect(resolveClockConfig({ presetId: CUSTOM_PRESET_ID, custom: { initialMs: 90 * MIN, incrementMs: 30_000 }, delayMs: 5000 })).toEqual({
			initialMs: 90 * MIN,
			incrementMs: 30_000,
			delayMs: 5000,
		});
		expect(describeClockConfig({ initialMs: 90 * MIN, incrementMs: 30_000, delayMs: 5000 })).toBe('90+30 d5');
		expect(clockCategory({ initialMs: MIN, incrementMs: 0 })).toBe('Bullet');
		expect(clockCategory({ initialMs: 5 * MIN, incrementMs: 0 })).toBe('Blitz');
		expect(clockCategory({ initialMs: 15 * MIN, incrementMs: 10_000 })).toBe('Rapid');
		expect(clockCategory({ initialMs: 30 * MIN, incrementMs: 20_000 })).toBe('Classical');
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TOAST_MS, toast, toasts } from './toast';

describe('toast service', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		toast.clear();
	});
	afterEach(() => {
		toast.clear();
		vi.useRealTimers();
	});

	it('show() adds a toast with defaults and returns its id', () => {
		const id = toast.show({ message: 'Saved' });
		expect(toasts.value).toHaveLength(1);
		expect(toasts.value[0]).toMatchObject({ id, message: 'Saved', kind: 'info', durationMs: DEFAULT_TOAST_MS });
	});

	it('kind shortcuts set kind and pass options', () => {
		toast.error('Engine failed', { title: 'Stockfish' });
		toast.success('Done');
		expect(toasts.value.map((t) => t.kind)).toEqual(['error', 'success']);
		expect(toasts.value[0].title).toBe('Stockfish');
	});

	it('dismiss() removes by id', () => {
		const a = toast.info('a');
		toast.info('b');
		toast.dismiss(a);
		expect(toasts.value.map((t) => t.message)).toEqual(['b']);
	});

	it('auto-dismisses after durationMs; 0 is sticky', () => {
		toast.info('auto', { durationMs: 1000 });
		toast.info('sticky', { durationMs: 0 });
		vi.advanceTimersByTime(999);
		expect(toasts.value).toHaveLength(2);
		vi.advanceTimersByTime(1);
		expect(toasts.value.map((t) => t.message)).toEqual(['sticky']);
		vi.advanceTimersByTime(60_000);
		expect(toasts.value).toHaveLength(1);
	});

	it('dedupes by id: replaces in place and restarts the timer', () => {
		toast.info('first');
		toast.info('Syncing…', { id: 'sync', durationMs: 1000 });
		vi.advanceTimersByTime(800);
		toast.success('Synced', { id: 'sync', durationMs: 1000 });
		expect(toasts.value).toHaveLength(2);
		expect(toasts.value[1]).toMatchObject({ id: 'sync', message: 'Synced', kind: 'success' });
		vi.advanceTimersByTime(800);
		expect(toasts.value.some((t) => t.id === 'sync')).toBe(true);
		vi.advanceTimersByTime(200);
		expect(toasts.value.some((t) => t.id === 'sync')).toBe(false);
	});

	it('pause/resume holds the timer', () => {
		const id = toast.info('hover me', { durationMs: 1000 });
		vi.advanceTimersByTime(500);
		toast.pause(id);
		vi.advanceTimersByTime(5000);
		expect(toasts.value).toHaveLength(1);
		toast.resume(id);
		vi.advanceTimersByTime(700);
		expect(toasts.value).toHaveLength(0);
	});

	it('clear() empties the stack', () => {
		toast.info('a');
		toast.info('b');
		toast.clear();
		expect(toasts.value).toEqual([]);
	});
});

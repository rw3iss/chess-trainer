import { describe, expect, it, vi } from 'vitest';
import { CommandBus } from './commands';

describe('CommandBus', () => {
	it('dispatch returns false when nobody handles the command', () => {
		const bus = new CommandBus();
		expect(bus.dispatch('save')).toBe(false);
	});

	it('the most recent handler wins; unregister restores the previous one', () => {
		const bus = new CommandBus();
		const fallback = vi.fn();
		const modal = vi.fn();
		bus.register('save', fallback);
		const off = bus.register('save', modal);
		expect(bus.dispatch('save')).toBe(true);
		expect(modal).toHaveBeenCalledOnce();
		expect(fallback).not.toHaveBeenCalled();
		off();
		bus.dispatch('save');
		expect(fallback).toHaveBeenCalledOnce();
		expect(bus.has('save')).toBe(true);
	});

	it('notifies dispatch observers even for unhandled commands', () => {
		const bus = new CommandBus();
		const seen: string[] = [];
		bus.onDispatch((id) => seen.push(id));
		bus.dispatch('focusSearch');
		expect(seen).toEqual(['focusSearch']);
	});
});

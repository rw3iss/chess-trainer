import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { VirtualList, computeWindow } from './VirtualList';

const ITEMS = Array.from({ length: 1000 }, (_, i) => `Line ${i}`);

describe('VirtualList', () => {
	it('computeWindow returns visible rows plus overscan', () => {
		expect(computeWindow(0, 400, 40, 1000, 6)).toEqual({ start: 0, end: 17 });
		expect(computeWindow(4000, 400, 40, 1000, 6)).toEqual({ start: 94, end: 117 });
		expect(computeWindow(0, 400, 40, 0, 6)).toEqual({ start: 0, end: -1 });
		expect(computeWindow(39_800, 400, 40, 1000, 6).end).toBe(999);
	});

	it('renders only a window of rows inside a full-height spacer', () => {
		render(<VirtualList items={ITEMS} itemHeight={40} renderItem={(s) => <span>{s}</span>} ariaLabel="Lines" />);
		const rows = screen.getAllByRole('listitem');
		expect(rows.length).toBeGreaterThan(5);
		expect(rows.length).toBeLessThan(40);
		expect(screen.getByText('Line 0')).toBeTruthy();
		expect(screen.queryByText('Line 500')).toBeNull();
		const spacer = document.querySelector<HTMLElement>('.virtual-list__spacer')!;
		expect(spacer.style.height).toBe('40000px');
		expect(rows[0].getAttribute('aria-setsize')).toBe('1000');
	});

	it('fires onEndReached when the window reaches the end', () => {
		const onEnd = vi.fn();
		render(<VirtualList items={ITEMS.slice(0, 5)} itemHeight={40} renderItem={(s) => <span>{s}</span>} onEndReached={onEnd} />);
		expect(onEnd).toHaveBeenCalledTimes(1);
	});
});

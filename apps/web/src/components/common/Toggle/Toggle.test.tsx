import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { Toggle } from './Toggle';

describe('Toggle', () => {
	it('is a labelled switch reflecting checked', () => {
		render(<Toggle checked={false} onChange={() => {}} label="Show arrows" description="Draw best-move arrows" />);
		const sw = screen.getByRole('switch', { name: 'Show arrows' });
		expect(sw.getAttribute('aria-checked')).toBe('false');
		expect(sw.getAttribute('aria-describedby')).toBeTruthy();
	});

	it('calls onChange with the inverted value', () => {
		const onChange = vi.fn();
		render(<Toggle checked onChange={onChange} label="Sound" />);
		fireEvent.click(screen.getByRole('switch'));
		expect(onChange).toHaveBeenCalledWith(false);
	});

	it('does not fire when disabled', () => {
		const onChange = vi.fn();
		render(<Toggle checked={false} onChange={onChange} label="Sound" disabled />);
		fireEvent.click(screen.getByRole('switch'));
		expect(onChange).not.toHaveBeenCalled();
	});
});

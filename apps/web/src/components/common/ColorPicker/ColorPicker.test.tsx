import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/preact';
import { ColorPicker } from './ColorPicker';

describe('ColorPicker', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('marks the matching swatch as checked', () => {
		render(<ColorPicker value="#C9A45C" onChange={() => {}} swatches={['#c9a45c', '#6fbf8a']} label="Accent" />);
		expect(screen.getByRole('radiogroup', { name: 'Accent' })).toBeTruthy();
		expect(screen.getByRole('radio', { name: '#c9a45c' }).getAttribute('aria-checked')).toBe('true');
	});

	it('emits normalized hex for valid text and flags invalid input', () => {
		const onChange = vi.fn();
		render(<ColorPicker value="#c9a45c" onChange={onChange} swatches={['#c9a45c']} />);
		const field = screen.getByLabelText('Hex colour') as HTMLInputElement;
		field.focus();

		fireEvent.input(field, { target: { value: '#zz12' } });
		expect(field.getAttribute('aria-invalid')).toBe('true');
		act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(onChange).not.toHaveBeenCalled();

		fireEvent.input(field, { target: { value: 'ABC' } });
		expect(field.getAttribute('aria-invalid')).toBeNull();
		act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(onChange).toHaveBeenLastCalledWith('#aabbcc');
	});

	it('reverts invalid text on blur', () => {
		const onChange = vi.fn();
		render(<ColorPicker value="#c9a45c" onChange={onChange} swatches={[]} />);
		const field = screen.getByLabelText('Hex colour') as HTMLInputElement;
		field.focus();
		fireEvent.input(field, { target: { value: 'nope' } });
		fireEvent.blur(field);
		expect(field.value).toBe('#c9a45c');
		expect(onChange).not.toHaveBeenCalled();
	});

	it('arrow keys move between swatches', () => {
		const onChange = vi.fn();
		render(<ColorPicker value="#c9a45c" onChange={onChange} swatches={['#c9a45c', '#6fbf8a', '#7aa7d9']} />);
		fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
		expect(onChange).toHaveBeenCalledWith('#6fbf8a');
	});
});

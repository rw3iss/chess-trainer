import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { SegmentedControl } from './SegmentedControl';

type Mode = 'light' | 'dark' | 'system';

function Harness() {
	const [v, setV] = useState<Mode>('dark');
	return (
		<SegmentedControl<Mode>
			ariaLabel="Theme"
			value={v}
			onChange={setV}
			options={[
				{ value: 'light', icon: 'sun', title: 'Light' },
				{ value: 'dark', icon: 'moon', title: 'Dark' },
				{ value: 'system', label: 'System' },
			]}
		/>
	);
}

describe('SegmentedControl', () => {
	it('renders a radiogroup with named radios', () => {
		render(<Harness />);
		expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
		expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('tabindex')).toBe('-1');
	});

	it('arrow keys change selection and focus', () => {
		render(<Harness />);
		const group = screen.getByRole('radiogroup');
		fireEvent.keyDown(group, { key: 'ArrowRight' });
		expect(screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('true');
		expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'System' }));
		fireEvent.keyDown(group, { key: 'ArrowRight' });
		expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
		fireEvent.keyDown(group, { key: 'ArrowUp' });
		expect(screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('true');
	});

	it('click selects', () => {
		render(<Harness />);
		fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
		expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
	});
});

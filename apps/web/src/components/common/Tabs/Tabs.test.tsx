import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { Tabs } from './Tabs';

type Id = 'moves' | 'notes' | 'games';
const ITEMS: { id: Id; label: string }[] = [
	{ id: 'moves', label: 'Moves' },
	{ id: 'notes', label: 'Notes' },
	{ id: 'games', label: 'Games' },
];

const tab = (name: string) => screen.getByRole('tab', { name });

function Harness() {
	const [v, setV] = useState<Id>('moves');
	return <Tabs items={ITEMS} value={v} onChange={setV} ariaLabel="Panel" />;
}

describe('Tabs', () => {
	it('renders a tablist with roving tabindex', () => {
		render(<Harness />);
		expect(screen.getByRole('tablist', { name: 'Panel' })).toBeTruthy();
		const tabs = screen.getAllByRole('tab');
		expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
		expect(tabs[0].getAttribute('aria-selected')).toBe('true');
	});

	it('moves selection and focus with arrow keys, Home and End', () => {
		render(<Harness />);
		tab('Moves').focus();
		fireEvent.keyDown(tab('Moves'), { key: 'ArrowRight' });
		expect(tab('Notes').getAttribute('aria-selected')).toBe('true');
		expect(document.activeElement).toBe(tab('Notes'));

		fireEvent.keyDown(tab('Notes'), { key: 'End' });
		expect(tab('Games').getAttribute('aria-selected')).toBe('true');

		fireEvent.keyDown(tab('Games'), { key: 'ArrowRight' });
		expect(tab('Moves').getAttribute('aria-selected')).toBe('true');

		fireEvent.keyDown(tab('Moves'), { key: 'ArrowLeft' });
		expect(tab('Games').getAttribute('aria-selected')).toBe('true');

		fireEvent.keyDown(tab('Games'), { key: 'Home' });
		expect(tab('Moves').getAttribute('aria-selected')).toBe('true');
		expect(document.activeElement).toBe(tab('Moves'));
	});

	it('selects on click', () => {
		render(<Harness />);
		fireEvent.click(screen.getByRole('tab', { name: 'Games' }));
		expect(screen.getByRole('tab', { name: 'Games' }).getAttribute('tabindex')).toBe('0');
	});
});

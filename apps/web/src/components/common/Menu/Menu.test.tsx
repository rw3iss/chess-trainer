import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { Menu } from './Menu';
import type { MenuItem } from './types';

function setup() {
	const onRename = vi.fn();
	const onDelete = vi.fn();
	const items: MenuItem[] = [
		{ heading: 'Line' },
		{ id: 'rename', label: 'Rename', icon: 'edit', onSelect: onRename },
		{ id: 'disabled', label: 'Export', disabled: true, onSelect: vi.fn() },
		{ separator: true },
		{ id: 'delete', label: 'Delete', danger: true, onSelect: onDelete },
	];
	render(<Menu items={items} trigger={(p) => <button {...p}>Actions</button>} />);
	return { onRename, onDelete, trigger: screen.getByText('Actions') };
}

describe('Menu', () => {
	it('opens on trigger click, sets aria-expanded and focuses the first item', () => {
		const { trigger } = setup();
		expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		fireEvent.click(trigger);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByRole('menu')).toBeTruthy();
		expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rename' }));
	});

	it('arrow keys skip disabled items and wrap', () => {
		const { trigger } = setup();
		fireEvent.click(trigger);
		const menu = screen.getByRole('menu');
		fireEvent.keyDown(menu, { key: 'ArrowDown' });
		expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Delete' }));
		fireEvent.keyDown(menu, { key: 'ArrowDown' });
		expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rename' }));
		fireEvent.keyDown(menu, { key: 'End' });
		expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Delete' }));
	});

	it('selecting an item calls onSelect, closes and refocuses the trigger', () => {
		const { trigger, onDelete } = setup();
		fireEvent.click(trigger);
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
		expect(onDelete).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('menu')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('Escape closes and refocuses the trigger', () => {
		const { trigger } = setup();
		fireEvent.click(trigger);
		fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
		expect(screen.queryByRole('menu')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('closes on outside pointerdown', () => {
		const { trigger } = setup();
		fireEvent.click(trigger);
		fireEvent.pointerDown(document.body);
		expect(screen.queryByRole('menu')).toBeNull();
	});
});

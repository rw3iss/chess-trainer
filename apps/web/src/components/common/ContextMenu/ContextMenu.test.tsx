import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { useContextMenu } from './useContextMenu';

function Harness({ onCopy }: { onCopy: () => void }) {
	const menu = useContextMenu();
	return (
		<div>
			<button onContextMenu={(e) => menu.open(e, [{ id: 'copy', label: 'Copy PGN', onSelect: onCopy }])}>Target</button>
			{menu.element}
		</div>
	);
}

describe('useContextMenu', () => {
	it('opens at the pointer, focuses the first item, selects and closes', () => {
		const onCopy = vi.fn();
		render(<Harness onCopy={onCopy} />);
		const target = screen.getByText('Target');
		target.focus();
		fireEvent.contextMenu(target, { clientX: 40, clientY: 50 });
		const item = screen.getByRole('menuitem', { name: 'Copy PGN' });
		expect(document.activeElement).toBe(item);
		fireEvent.click(item);
		expect(onCopy).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('menu')).toBeNull();
		expect(document.activeElement).toBe(target);
	});

	it('Escape closes', () => {
		render(<Harness onCopy={() => {}} />);
		fireEvent.contextMenu(screen.getByText('Target'), { clientX: 1, clientY: 1 });
		fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
		expect(screen.queryByRole('menu')).toBeNull();
	});
});

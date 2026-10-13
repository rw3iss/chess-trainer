import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { getNode, treeFromUci } from '@chess/core/chess';
import { MoveList, type MoveListActions } from './MoveList';

function actions(): MoveListActions {
	return { goto: vi.fn(), fork: vi.fn(), deleteFrom: vi.fn(), promote: vi.fn(), editNote: vi.fn() };
}

describe('MoveList', () => {
	const tree = treeFromUci(['e2e4', 'e7e5', 'g1f3']);
	const e5 = getNode(tree, getNode(tree, 'root').children[0]!).children[0]!;

	it('renders numbered pairs, figurines and marks the current move', () => {
		render(<MoveList session={{ tree, cursor: e5 }} actions={actions()} />);
		expect(screen.getByText('e4')).toBeTruthy();
		expect(screen.getByText('♘')).toBeTruthy();
		expect(document.body.textContent).toContain('♘Nf3');
		const current = document.querySelector('[aria-current="step"]');
		expect(current?.textContent).toContain('e5');
	});

	it('click jumps to the move', () => {
		const a = actions();
		render(<MoveList session={{ tree, cursor: 'root' }} actions={a} />);
		fireEvent.click(screen.getByText('e5'));
		expect(a.goto).toHaveBeenCalledWith(e5);
	});

	it('context menu offers fork / delete / note', () => {
		const a = actions();
		render(<MoveList session={{ tree, cursor: 'root' }} actions={a} />);
		fireEvent.contextMenu(screen.getByText('e5'), { clientX: 10, clientY: 10 });
		fireEvent.click(screen.getByText('Fork here'));
		expect(a.fork).toHaveBeenCalledWith(e5);
	});

	it('shows a hint for an empty tree', () => {
		render(<MoveList session={{ tree: treeFromUci([]), cursor: 'root' }} actions={actions()} />);
		expect(screen.getByText(/Make a move/)).toBeTruthy();
	});
});

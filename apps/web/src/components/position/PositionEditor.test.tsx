import { describe, expect, it, vi } from 'vitest';
import { useState } from 'preact/hooks';
import { fireEvent, render, screen } from '@testing-library/preact';
import { INITIAL_FEN } from '@chess/core/chess';
import { PositionEditor, type PositionEditorProps } from './PositionEditor';

const KINGS = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

/** Controlled host so edits flow back into the editor. */
function Host(props: Partial<PositionEditorProps> & { initial: string; spy?: (fen: string) => void }) {
	const [fen, setFen] = useState(props.initial);
	return (
		<PositionEditor
			{...props}
			fen={fen}
			onChange={(f) => {
				props.spy?.(f);
				setFen(f);
			}}
		/>
	);
}

const first = () => document.querySelector('[data-square-index]')?.getAttribute('aria-label');
const square = (name: RegExp | string) => screen.getByRole('button', { name: typeof name === 'string' ? new RegExp(`^${name},`) : name });

describe('PositionEditor', () => {
	it('labels squares with their contents', () => {
		render(<PositionEditor fen={INITIAL_FEN} onChange={() => {}} />);
		expect(screen.getByRole('button', { name: 'e1, white king' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'e4, empty' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'd8, black queen' })).toBeTruthy();
	});

	it('places the selected tool; clicking the same piece again clears it', () => {
		const spy = vi.fn();
		render(<Host initial={KINGS} spy={spy} />);
		fireEvent.click(screen.getByRole('radio', { name: 'white knight' }));
		fireEvent.click(square('e4'));
		expect(spy).toHaveBeenLastCalledWith('4k3/8/8/8/4N3/8/8/4K3 w - - 0 1');
		expect(square('e4').getAttribute('aria-label')).toBe('e4, white knight');
		fireEvent.click(square('e4'));
		expect(spy).toHaveBeenLastCalledWith(KINGS);
	});

	it('eraser and right-click clear squares', () => {
		const spy = vi.fn();
		render(<Host initial={INITIAL_FEN} spy={spy} />);
		fireEvent.contextMenu(square('a2'));
		expect(spy.mock.lastCall?.[0]).toMatch(/^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/1PPPPPPP\/RNBQKBNR /);
		fireEvent.click(screen.getByRole('radio', { name: /Eraser/ }));
		fireEvent.click(square('a1'));
		expect(spy.mock.lastCall?.[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/1NBQKBNR w Kkq - 0 1');
	});

	it('side to move and castling toggles', () => {
		const spy = vi.fn();
		render(<Host initial={INITIAL_FEN} spy={spy} />);
		fireEvent.click(screen.getByRole('radio', { name: 'Black' }));
		expect(spy).toHaveBeenLastCalledWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
		fireEvent.click(screen.getByRole('checkbox', { name: 'White can castle queenside' }));
		expect(spy.mock.lastCall?.[0]).toContain(' b Kkq ');
	});

	it('castling toggles are disabled when the placement does not allow them', () => {
		render(<PositionEditor fen={KINGS} onChange={() => {}} />);
		const k = screen.getByRole('checkbox', { name: 'White can castle kingside' }) as HTMLInputElement;
		expect(k.disabled).toBe(true);
	});

	it('flip view changes square order only; rotate position moves pieces', () => {
		const spy = vi.fn();
		render(<Host initial="k7/8/8/8/8/8/8/6RK w - - 0 1" spy={spy} />);
		expect(first()).toBe('a8, black king');
		fireEvent.click(screen.getByRole('button', { name: 'Flip view' }));
		expect(first()).toBe('h1, white king');
		expect(spy).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole('button', { name: 'Rotate position' }));
		expect(spy).toHaveBeenLastCalledWith('KR6/8/8/8/8/8/8/7k w - - 0 1');
	});

	it('clear board and start position', () => {
		const spy = vi.fn();
		render(<Host initial={INITIAL_FEN} spy={spy} />);
		fireEvent.click(screen.getByRole('button', { name: 'Clear board' }));
		expect(spy).toHaveBeenLastCalledWith('8/8/8/8/8/8/8/8 w - - 0 1');
		expect(screen.getByRole('alert').textContent).toContain('The board is empty');
		fireEvent.click(screen.getByRole('button', { name: 'Start position' }));
		expect(spy).toHaveBeenLastCalledWith(INITIAL_FEN);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('FEN field: valid edits apply, invalid ones show an error', () => {
		const spy = vi.fn();
		render(<Host initial={INITIAL_FEN} spy={spy} />);
		const input = screen.getByLabelText('FEN') as HTMLInputElement;
		fireEvent.input(input, { target: { value: '8/8/8' } });
		expect(spy).not.toHaveBeenCalled();
		expect(input.getAttribute('aria-invalid')).toBe('true');
		fireEvent.input(input, { target: { value: '4k3/8/8/8/8/8/8/4K3 b' } });
		expect(spy).toHaveBeenLastCalledWith('4k3/8/8/8/8/8/8/4K3 b - - 0 1');
		expect(input.value).toBe('4k3/8/8/8/8/8/8/4K3 b'); // not overwritten while typing
		expect(input.getAttribute('aria-invalid')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Start position' }));
		expect(input.value).toBe(INITIAL_FEN);
	});

	it('lists setup errors', () => {
		render(<PositionEditor fen="4k2R/8/8/8/8/8/8/4K3 w - - 0 1" onChange={() => {}} />);
		expect(screen.getByRole('alert').textContent).toContain('The side not to move is in check');
	});

	it('flags uncertain squares until they are edited', () => {
		render(<Host initial={KINGS} uncertain={['e4', 'e1']} />);
		expect(screen.getByRole('button', { name: 'e4, empty, uncertain' })).toBeTruthy();
		expect(document.body.textContent).toContain('Check the outlined squares: e4, e1');
		fireEvent.click(square('e4'));
		expect(document.body.textContent).toContain('Check the outlined squares: e1');
		expect(square('e4').classList.contains('position-editor__square--uncertain')).toBe(false);
	});

	it('keyboard: arrows move focus, letters place pieces, Delete clears', () => {
		const spy = vi.fn();
		render(<Host initial={KINGS} spy={spy} />);
		const a8 = square('a8');
		expect(a8.tabIndex).toBe(0);
		a8.focus();
		fireEvent.keyDown(a8, { key: 'ArrowRight' });
		expect(document.activeElement?.getAttribute('aria-label')).toBe('b8, empty');
		fireEvent.keyDown(document.activeElement!, { key: 'N' });
		expect(spy).toHaveBeenLastCalledWith('1N2k3/8/8/8/8/8/8/4K3 w - - 0 1');
		fireEvent.keyDown(square('b8'), { key: 'Delete' });
		expect(spy).toHaveBeenLastCalledWith(KINGS);
	});

	it('palette is a radiogroup with arrow-key selection', () => {
		render(<PositionEditor fen={KINGS} onChange={() => {}} />);
		const group = screen.getByRole('radiogroup', { name: 'Piece to place' });
		expect(screen.getAllByRole('radio').filter((r) => group.contains(r))).toHaveLength(13);
		const pawn = screen.getByRole('radio', { name: 'white pawn' });
		expect(pawn.getAttribute('aria-checked')).toBe('true');
		fireEvent.keyDown(pawn, { key: 'ArrowDown' });
		expect(screen.getByRole('radio', { name: 'black pawn' }).getAttribute('aria-checked')).toBe('true');
	});
});

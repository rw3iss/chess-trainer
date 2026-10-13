import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/preact';
import { Board2D } from '../Board2D';
import { EvalBar } from '../EvalBar';
import { MiniBoard } from '../MiniBoard';
import { baseProps, pieceSet, pieceTheme } from './fixtures';
import { BUILTIN_BOARD_THEMES } from '@chess/core/theme';

// 400px board → 50px squares, origin (0,0).
const RECT = { left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400, x: 0, y: 0, toJSON() {} } as DOMRect;
const origRect = Element.prototype.getBoundingClientRect;

function at(sq: string) {
	const file = sq.charCodeAt(0) - 97;
	const rank = sq.charCodeAt(1) - 49;
	return { clientX: file * 50 + 25, clientY: (7 - rank) * 50 + 25 };
}

function boardEl(container: Element) {
	return container.querySelector('.board') as HTMLElement;
}

function press(el: HTMLElement, sq: string, extra: Record<string, unknown> = {}) {
	fireEvent.pointerDown(el, { pointerId: 1, button: 0, pointerType: 'mouse', ...at(sq), ...extra });
}
function release(el: HTMLElement, sq: string, extra: Record<string, unknown> = {}) {
	fireEvent.pointerUp(el, { pointerId: 1, button: 0, pointerType: 'mouse', ...at(sq), ...extra });
}
function move(el: HTMLElement, sq: string, extra: Record<string, unknown> = {}) {
	fireEvent.pointerMove(el, { pointerId: 1, pointerType: 'mouse', ...at(sq), ...extra });
}

beforeEach(() => {
	Element.prototype.getBoundingClientRect = function () {
		return RECT;
	};
	vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in tests'))));
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
	Element.prototype.getBoundingClientRect = origRect;
	vi.unstubAllGlobals();
});

describe('Board2D', () => {
	it('renders 32 pieces, squares and coordinates', () => {
		const { container } = render(<Board2D {...baseProps()} />);
		expect(container.querySelectorAll('.board__piece')).toHaveLength(32);
		expect(container.querySelectorAll('.board__piece--white')).toHaveLength(16);
		expect(container.querySelectorAll('.board__coord')).toHaveLength(16);
		expect(container.querySelector('use')?.getAttribute('href')).toMatch(/^#test--[KQRBNP]$/);
		expect(boardEl(container).style.getPropertyValue('--board-light')).toBe(BUILTIN_BOARD_THEMES[0].light);
		expect(boardEl(container).style.getPropertyValue('--pc-white-body')).toBe('#fff');
	});

	it('sizes the board to an integer square size', () => {
		const { container } = render(<Board2D {...baseProps()} />);
		expect(boardEl(container).style.width).toBe('400px');
		expect(boardEl(container).style.getPropertyValue('--sq')).toBe('50px');
	});

	it('click-click moves along dests and shows legal dots', () => {
		const onMove = vi.fn();
		const onSelect = vi.fn();
		const { container } = render(<Board2D {...baseProps({ onMove, onSelect })} />);
		const el = boardEl(container);
		press(el, 'e2');
		release(el, 'e2');
		expect(onSelect).toHaveBeenLastCalledWith('e2');
		expect(container.querySelectorAll('.board__hl--dest')).toHaveLength(2);
		expect(container.querySelector('.board__hl--selected')).not.toBeNull();
		press(el, 'e4');
		expect(onMove).toHaveBeenCalledWith('e2', 'e4', undefined);
	});

	it('ignores non-dest clicks and deselects', () => {
		const onMove = vi.fn();
		const { container } = render(<Board2D {...baseProps({ onMove })} />);
		const el = boardEl(container);
		press(el, 'e2');
		release(el, 'e2');
		press(el, 'e5');
		release(el, 'e5');
		expect(onMove).not.toHaveBeenCalled();
		expect(container.querySelector('.board__hl--selected')).toBeNull();
	});

	it('drags a piece past the threshold and drops it on a dest', () => {
		const onMove = vi.fn();
		const { container } = render(<Board2D {...baseProps({ onMove })} />);
		const el = boardEl(container);
		press(el, 'g1');
		move(el, 'g2');
		expect(container.querySelector('.board__ghost--active')).not.toBeNull();
		expect(container.querySelector('.board__piece--drag-origin')).not.toBeNull();
		move(el, 'f3');
		release(el, 'f3');
		expect(onMove).toHaveBeenCalledWith('g1', 'f3', undefined);
		expect(container.querySelector('.board__ghost--active')).toBeNull();
	});

	it('does not drag in click-only mode and does not select when not movable', () => {
		const onMove = vi.fn();
		const { container, rerender } = render(<Board2D {...baseProps({ onMove, input: 'click' })} />);
		const el = boardEl(container);
		press(el, 'g1');
		move(el, 'f3');
		expect(container.querySelector('.board__ghost--active')).toBeNull();
		release(el, 'f3');
		expect(onMove).not.toHaveBeenCalled();

		rerender(<Board2D {...baseProps({ onMove, movable: 'none' })} />);
		press(el, 'e2');
		expect(container.querySelector('.board__hl--selected')).toBeNull();
	});

	it('refuses to select the opponent pieces', () => {
		const { container } = render(<Board2D {...baseProps()} />);
		press(boardEl(container), 'e7');
		expect(container.querySelector('.board__hl--selected')).toBeNull();
	});

	it('opens the promotion picker and reports the chosen role', () => {
		const onMove = vi.fn();
		const props = baseProps({
			fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
			dests: new Map([['a7', ['a8']]]),
			onMove,
		});
		const { container, getByLabelText } = render(<Board2D {...props} />);
		const el = boardEl(container);
		press(el, 'a7');
		release(el, 'a7');
		press(el, 'a8');
		expect(onMove).not.toHaveBeenCalled();
		expect(container.querySelectorAll('.promotion__choice')).toHaveLength(4);
		fireEvent.click(getByLabelText('Promote to knight'));
		expect(onMove).toHaveBeenCalledWith('a7', 'a8', 'knight');
		expect(container.querySelector('.promotion')).toBeNull();
	});

	it('supports keyboard selection and moves', () => {
		const onMove = vi.fn();
		const { container } = render(<Board2D {...baseProps({ onMove })} />);
		const el = boardEl(container);
		el.focus();
		// Focus starts at a1; walk to e2.
		fireEvent.keyDown(el, { key: 'ArrowRight' });
		for (let i = 0; i < 4; i++) fireEvent.keyDown(el, { key: 'ArrowRight' });
		fireEvent.keyDown(el, { key: 'ArrowUp' });
		expect(container.querySelector('.board__sr')?.textContent).toContain('e2, white pawn');
		fireEvent.keyDown(el, { key: 'Enter' });
		fireEvent.keyDown(el, { key: 'ArrowUp' });
		fireEvent.keyDown(el, { key: 'ArrowUp' });
		expect(container.querySelector('.board__sr')?.textContent).toContain('e4, empty');
		fireEvent.keyDown(el, { key: ' ' });
		expect(onMove).toHaveBeenCalledWith('e2', 'e4', undefined);
	});

	it('draws user arrows and circles with the right button', () => {
		const onDraw = vi.fn();
		const { container } = render(<Board2D {...baseProps({ onDraw })} />);
		const el = boardEl(container);
		fireEvent.pointerDown(el, { pointerId: 2, button: 2, ...at('e2') });
		fireEvent.pointerMove(el, { pointerId: 2, ...at('e4') });
		fireEvent.pointerUp(el, { pointerId: 2, button: 2, ...at('e4') });
		expect(onDraw).toHaveBeenLastCalledWith({ arrows: [{ from: 'e2', to: 'e4', color: undefined }], marks: [] });
		expect(container.querySelectorAll('.board__arrow')).toHaveLength(1);
		fireEvent.pointerDown(el, { pointerId: 2, button: 2, ...at('d4') });
		fireEvent.pointerUp(el, { pointerId: 2, button: 2, ...at('d4') });
		expect(onDraw.mock.lastCall?.[0].marks).toHaveLength(1);
		// Left click clears user shapes.
		press(el, 'd5');
		expect(onDraw).toHaveBeenLastCalledWith({ arrows: [], marks: [] });
	});

	it('renders last move, check and prop arrows', () => {
		const { container } = render(
			<Board2D
				{...baseProps({
					lastMove: ['e2', 'e4'],
					check: 'e1',
					arrows: [{ from: 'g1', to: 'f3' }],
					marks: [{ square: 'd4', kind: 'highlight' }],
				})}
			/>,
		);
		expect(container.querySelectorAll('.board__hl--last')).toHaveLength(2);
		expect(container.querySelector('.board__hl--check')).not.toBeNull();
		expect(container.querySelector('.board__hl--mark')).not.toBeNull();
		expect(container.querySelectorAll('.board__arrow')).toHaveLength(1);
	});

	it('keeps piece DOM nodes stable across a move (only the mover changes)', () => {
		const props = baseProps();
		const { container, rerender } = render(<Board2D {...props} />);
		const before = Array.from(container.querySelectorAll('.board__piece'));
		rerender(<Board2D {...props} fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" />);
		const after = Array.from(container.querySelectorAll('.board__piece'));
		expect(after).toHaveLength(32);
		expect(after.filter((n) => before.includes(n))).toHaveLength(32);
	});

	it('renders a texture overlay for textured themes', () => {
		const walnut = BUILTIN_BOARD_THEMES.find((t) => t.texture.kind === 'wood')!;
		const { container } = render(<Board2D {...baseProps({ boardTheme: walnut })} />);
		expect(container.querySelector('.board__texture--wood filter')).not.toBeNull();
	});
});

describe('MiniBoard', () => {
	it('renders a static svg with one <use> per piece', () => {
		const { container } = render(
			<MiniBoard fen="4k3/8/8/8/8/8/8/4K3 w - - 0 1" boardTheme={BUILTIN_BOARD_THEMES[0]} pieceTheme={pieceTheme} pieceSet={pieceSet} />,
		);
		expect(container.querySelectorAll('use')).toHaveLength(2);
		expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
	});
});

describe('EvalBar', () => {
	it('clamps and exposes the probability', () => {
		const { container } = render(<EvalBar whiteProb={1.4} label="+9.9" />);
		const bar = container.querySelector('.eval-bar') as HTMLElement;
		expect(bar.getAttribute('aria-valuenow')).toBe('100');
		expect((container.querySelector('.eval-bar__white') as HTMLElement).style.height).toBe('100%');
		expect(container.querySelector('.eval-bar__label--white')?.textContent).toBe('+9.9');
	});
});

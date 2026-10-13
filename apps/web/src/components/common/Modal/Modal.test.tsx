import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { Modal } from './Modal';

function Harness({ onClose }: { onClose?: () => void }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button onClick={() => setOpen(true)}>Open</button>
			<Modal
				open={open}
				title="Save line"
				description="Name this variation"
				initialFocus="#name"
				onClose={() => {
					onClose?.();
					setOpen(false);
				}}
			>
				<input id="name" aria-label="Name" />
				<button>Inner</button>
			</Modal>
		</>
	);
}

describe('Modal', () => {
	it('renders an accessible dialog into the portal root and focuses initialFocus', () => {
		render(<Harness />);
		const opener = screen.getByText('Open');
		opener.focus();
		fireEvent.click(opener);
		const dialog = screen.getByRole('dialog', { name: 'Save line' });
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		expect(dialog.closest('#portal-root')).toBeTruthy();
		expect(document.activeElement).toBe(screen.getByLabelText('Name'));
		expect(document.body.style.overflow).toBe('hidden');
	});

	it('closes on Escape and restores focus to the opener', () => {
		vi.useFakeTimers();
		try {
			const onClose = vi.fn();
			render(<Harness onClose={onClose} />);
			const opener = screen.getByText('Open');
			opener.focus();
			fireEvent.click(opener);
			fireEvent.keyDown(document, { key: 'Escape' });
			expect(onClose).toHaveBeenCalledTimes(1);
			act(() => {
				vi.advanceTimersByTime(500);
			});
			expect(screen.queryByRole('dialog')).toBeNull();
			expect(document.activeElement).toBe(opener);
			expect(document.body.style.overflow).toBe('');
		} finally {
			vi.useRealTimers();
		}
	});

	it('closes on backdrop click and on the close button', () => {
		const onClose = vi.fn();
		render(<Harness onClose={onClose} />);
		fireEvent.click(screen.getByText('Open'));
		fireEvent.click(document.querySelector('.modal-layer__backdrop')!);
		expect(onClose).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByText('Open'));
		fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
		expect(onClose).toHaveBeenCalledTimes(2);
	});

	it('traps Tab inside the dialog', () => {
		render(<Harness />);
		fireEvent.click(screen.getByText('Open'));
		const inner = screen.getByText('Inner');
		inner.focus();
		fireEvent.keyDown(document, { key: 'Tab' });
		// Wraps to the first focusable (the header close button).
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
	});
});

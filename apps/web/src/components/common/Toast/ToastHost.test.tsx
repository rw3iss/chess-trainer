import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/preact';
import { toast, toasts } from '@/services/toast';
import { ToastHost } from './ToastHost';

describe('ToastHost', () => {
	afterEach(() => {
		act(() => toast.clear());
	});

	it('renders toasts in a polite live region and dismisses via close / action', () => {
		const onUndo = vi.fn();
		render(<ToastHost />);
		expect(screen.getByRole('region', { name: 'Notifications' }).getAttribute('aria-live')).toBe('polite');
		act(() => {
			toast.success('Line saved', { action: { label: 'Undo', onClick: onUndo }, durationMs: 0 });
		});
		expect(screen.getByText('Line saved')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		expect(onUndo).toHaveBeenCalledTimes(1);
		expect(toasts.value).toHaveLength(0);

		act(() => {
			toast.error('Boom', { durationMs: 0 });
		});
		expect(screen.getByRole('alert')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
		expect(toasts.value).toHaveLength(0);
	});
});

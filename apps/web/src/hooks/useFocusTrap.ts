// Traps Tab focus inside `ref` while `active`. On activation focuses
// `initialFocus` (CSS selector inside the container), else the first
// focusable, else the container. On deactivation restores the previously
// focused element (unless restoreFocus === false).

import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';

const FOCUSABLE = [
	'a[href]',
	'area[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'iframe',
	'[contenteditable="true"]',
	'[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusable(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && !el.closest('[inert]'),
	);
}

export interface FocusTrapOptions {
	initialFocus?: string;
	restoreFocus?: boolean;
}

export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, opts: FocusTrapOptions = {}): void {
	const { initialFocus, restoreFocus = true } = opts;

	useEffect(() => {
		if (!active) return;
		const container = ref.current;
		if (!container) return;
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

		const target =
			(initialFocus ? container.querySelector<HTMLElement>(initialFocus) : null) ??
			getFocusable(container)[0] ??
			container;
		if (target === container && !container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
		target.focus({ preventScroll: true });

		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Tab') return;
			const items = getFocusable(container);
			if (items.length === 0) {
				e.preventDefault();
				container.focus();
				return;
			}
			const first = items[0];
			const last = items[items.length - 1];
			const current = document.activeElement;
			if (e.shiftKey && (current === first || !container.contains(current))) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && (current === last || !container.contains(current))) {
				e.preventDefault();
				first.focus();
			}
		};
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('keydown', onKey);
			if (restoreFocus && previous && previous.isConnected) previous.focus({ preventScroll: true });
		};
	}, [active, initialFocus, restoreFocus]);
}

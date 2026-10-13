// Imperative context-menu host. Render `element` once; call open(e, items)
// from onContextMenu (or a long-press). Focus returns to where it was on close.

import type { VNode } from 'preact';
import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { MenuItem } from '../Menu/types';
import { ContextMenu } from './ContextMenu';

interface PointLike {
	clientX: number;
	clientY: number;
	preventDefault?: () => void;
}

export interface UseContextMenu {
	open(e: { clientX: number; clientY: number }, items: MenuItem[]): void;
	close(): void;
	element: VNode | null;
}

export function useContextMenu(): UseContextMenu {
	const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
	const restore = useRef<HTMLElement | null>(null);

	const open = useCallback((e: PointLike, items: MenuItem[]) => {
		if (typeof e.preventDefault === 'function') e.preventDefault();
		restore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		setState({ x: e.clientX, y: e.clientY, items });
	}, []);

	const close = useCallback(() => {
		setState(null);
		const el = restore.current;
		restore.current = null;
		if (el && el.isConnected) el.focus({ preventScroll: true });
	}, []);

	const element = useMemo(
		() => (state ? <ContextMenu open x={state.x} y={state.y} items={state.items} onClose={close} /> : null),
		[state, close],
	);

	return { open, close, element };
}

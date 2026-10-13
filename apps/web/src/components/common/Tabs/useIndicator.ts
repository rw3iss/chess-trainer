// Measures the active item inside a container and returns inline styles for a
// sliding indicator (left offset + width). Re-measures on resize.

import type { RefObject } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';

export interface IndicatorRect {
	left: number;
	width: number;
	ready: boolean;
}

export function useIndicator(containerRef: RefObject<HTMLElement>, activeSelector: string, deps: unknown[]): IndicatorRect {
	const [rect, setRect] = useState<IndicatorRect>({ left: 0, width: 0, ready: false });

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const measure = () => {
			const el = container.querySelector<HTMLElement>(activeSelector);
			if (!el) return;
			const next = { left: el.offsetLeft, width: el.offsetWidth, ready: el.offsetWidth > 0 };
			setRect((prev) => (prev.left === next.left && prev.width === next.width && prev.ready === next.ready ? prev : next));
		};
		measure();
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
		ro?.observe(container);
		return () => ro?.disconnect();
		// deps are caller-provided (active value, item list).
	}, deps);

	return rect;
}

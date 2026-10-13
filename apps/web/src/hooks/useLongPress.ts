// Touch/pen long-press → onLongPress({clientX, clientY}). Mouse is ignored
// (desktop uses the native contextmenu event). Cancels on >8px movement.

import type { JSX } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';

const MOVE_TOLERANCE = 8;

export interface LongPressHandlers {
	onPointerDown: (e: JSX.TargetedPointerEvent<Element>) => void;
	onPointerUp: (e: JSX.TargetedPointerEvent<Element>) => void;
	onPointerMove: (e: JSX.TargetedPointerEvent<Element>) => void;
	onPointerCancel: (e: JSX.TargetedPointerEvent<Element>) => void;
}

export function useLongPress(onLongPress: (pt: { clientX: number; clientY: number }) => void, ms = 500): LongPressHandlers {
	const cbRef = useRef(onLongPress);
	cbRef.current = onLongPress;
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const start = useRef<{ x: number; y: number } | null>(null);

	useEffect(() => () => {
		if (timer.current) clearTimeout(timer.current);
	}, []);

	return useMemo<LongPressHandlers>(() => {
		const clear = () => {
			if (timer.current) clearTimeout(timer.current);
			timer.current = null;
			start.current = null;
		};
		return {
			onPointerDown: (e) => {
				if (e.pointerType === 'mouse') return;
				clear();
				const pt = { clientX: e.clientX, clientY: e.clientY };
				start.current = { x: e.clientX, y: e.clientY };
				timer.current = setTimeout(() => {
					timer.current = null;
					start.current = null;
					cbRef.current(pt);
				}, ms);
			},
			onPointerMove: (e) => {
				if (!start.current) return;
				if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE) clear();
			},
			onPointerUp: clear,
			onPointerCancel: clear,
		};
	}, [ms]);
}

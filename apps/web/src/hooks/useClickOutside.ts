// Calls `handler` on a pointerdown outside every element in `refs`.

import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export function useClickOutside(refs: RefObject<HTMLElement>[], handler: (e: PointerEvent) => void, active = true): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;
	const refsRef = useRef(refs);
	refsRef.current = refs;

	useEffect(() => {
		if (!active) return;
		const onDown = (e: PointerEvent) => {
			const target = e.target as Node | null;
			if (!target) return;
			for (const r of refsRef.current) if (r.current && r.current.contains(target)) return;
			handlerRef.current(e);
		};
		document.addEventListener('pointerdown', onDown, true);
		return () => document.removeEventListener('pointerdown', onDown, true);
	}, [active]);
}

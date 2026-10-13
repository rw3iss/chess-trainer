// Shared overlay behaviour: registers a layer, closes on Escape when topmost,
// and optionally locks body scroll while active.

import { useEffect, useRef } from 'preact/hooks';
import { isTopLayer, pushLayer } from './layerStack';
import { lockScroll } from './scrollLock';

export function useOverlayLayer(active: boolean, onEscape: () => void, opts: { lockScroll?: boolean } = {}): void {
	const escRef = useRef(onEscape);
	escRef.current = onEscape;
	const lock = opts.lockScroll ?? false;

	useEffect(() => {
		if (!active) return;
		const token = Symbol('layer');
		const release = pushLayer(token);
		const unlock = lock ? lockScroll() : null;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || !isTopLayer(token)) return;
			e.preventDefault();
			e.stopPropagation();
			escRef.current();
		};
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('keydown', onKey);
			release();
			unlock?.();
		};
	}, [active, lock]);
}

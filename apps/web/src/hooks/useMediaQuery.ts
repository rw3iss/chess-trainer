// Reactive media query. `useIsStacked()` = the mobile (< 900 px) app layout (PLAN §4.1).
import { useEffect, useState } from 'preact/hooks';

export const STACKED_QUERY = '(max-width: 899px)';

function match(query: string): boolean {
	return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false;
}

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => match(query));
	useEffect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
		const mql = window.matchMedia(query);
		const onChange = () => setMatches(mql.matches);
		onChange();
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	}, [query]);
	return matches;
}

export function useIsStacked(): boolean {
	return useMediaQuery(STACKED_QUERY);
}

// Persisted UI state.
//
// Drop-in replacement for useState that survives reloads by writing through to
// localStorage (via lib/storage). Use it for UI preferences and view state that
// should be restored next visit: sidebar open/closed, active tab, density mode,
// sort order, dismissed banners, etc. Do NOT use it for server data — that's the
// data-cache layer's job (services/cache).
//
// App-wide view preferences should be registered in lib/uiSettings.ts and read with
// useUISetting(key) (typed key + one default). Use useUIState directly only for
// dynamic keys (e.g. one per item).
//
//   const [open, setOpen] = useUIState('sidebar.open', true);
//   const [tab, setTab]   = useUIState('settings.tab', 'profile');

import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { uiStorage } from '@/lib/storage';

export function useUIState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
	const [value, setValue] = useState<T>(() => uiStorage.get<T>(key, initial) as T);
	const initialRef = useRef(initial);
	initialRef.current = initial;

	// Keep multiple consumers of the same key in sync within the tab; a removed key (reset) reads its default.
	useEffect(() => uiStorage.subscribe<T>(key, (next) => {
		setValue(next !== undefined ? next : initialRef.current);
	}), [key]);

	const set = useCallback((next: T | ((prev: T) => T)) => {
		setValue((prev) => {
			const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
			uiStorage.set(key, resolved);
			return resolved;
		});
	}, [key]);

	return [value, set];
}

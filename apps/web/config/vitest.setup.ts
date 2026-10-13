// Global test setup: in-memory IndexedDB for Dexie repositories + DOM cleanup.
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/preact';

afterEach(() => {
	cleanup();
});

// jsdom lacks these; components use them defensively.
if (typeof window !== 'undefined') {
	window.matchMedia ??= ((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
	window.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView ??= function () {};
}

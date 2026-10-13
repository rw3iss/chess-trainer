// Timing helpers shared by every input/scroll/resize handler.
// BUILD.md: bound input handlers are throttled to 100 ms by default.

export const DEFAULT_THROTTLE_MS = 100;

export interface Cancelable {
	cancel(): void;
}

/** Leading + trailing throttle. The last call inside a window always runs. */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms = DEFAULT_THROTTLE_MS): ((...args: A) => void) & Cancelable {
	let last = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pending: A | null = null;
	const run = (args: A) => {
		last = Date.now();
		fn(...args);
	};
	const throttled = (...args: A) => {
		const wait = ms - (Date.now() - last);
		if (wait <= 0) {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			run(args);
			return;
		}
		pending = args;
		if (!timer) {
			timer = setTimeout(() => {
				timer = null;
				if (pending) run(pending);
				pending = null;
			}, wait);
		}
	};
	throttled.cancel = () => {
		if (timer) clearTimeout(timer);
		timer = null;
		pending = null;
	};
	return throttled;
}

/** Trailing debounce with `flush()` (run now if pending) and `cancel()`. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & Cancelable & { flush(): void; pending(): boolean } {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pendingArgs: A | null = null;
	const debounced = (...args: A) => {
		pendingArgs = args;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			const a = pendingArgs;
			pendingArgs = null;
			if (a) fn(...a);
		}, ms);
	};
	debounced.cancel = () => {
		if (timer) clearTimeout(timer);
		timer = null;
		pendingArgs = null;
	};
	debounced.flush = () => {
		if (!timer) return;
		clearTimeout(timer);
		timer = null;
		const a = pendingArgs;
		pendingArgs = null;
		if (a) fn(...a);
	};
	debounced.pending = () => timer !== null;
	return debounced;
}

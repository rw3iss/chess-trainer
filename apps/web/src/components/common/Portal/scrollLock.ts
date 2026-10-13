// Ref-counted body scroll lock. Each overlay calls lockScroll() on open and the
// returned release function on close; the body unlocks when the last releases.
// Compensates for the scrollbar width so the page does not shift.

let count = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

export function lockScroll(): () => void {
	if (typeof document === 'undefined') return () => {};
	const body = document.body;
	if (count === 0) {
		saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
		const gap = window.innerWidth - document.documentElement.clientWidth;
		body.style.overflow = 'hidden';
		if (gap > 0) body.style.paddingRight = `${gap}px`;
	}
	count++;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		count = Math.max(0, count - 1);
		if (count === 0 && saved) {
			body.style.overflow = saved.overflow;
			body.style.paddingRight = saved.paddingRight;
			saved = null;
		}
	};
}

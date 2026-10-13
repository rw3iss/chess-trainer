// Pure popover placement: positions a floating box against an anchor rect,
// flipping vertically when there is no room and clamping to the viewport.

export interface Rect {
	top: number;
	left: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

export interface PlaceOptions {
	align: 'start' | 'end';
	placement: 'bottom' | 'top';
	gap?: number;
	margin?: number;
	viewport?: { width: number; height: number };
}

export interface Placed {
	top: number;
	left: number;
	placement: 'bottom' | 'top';
}

export function placePopover(anchor: Rect, size: { width: number; height: number }, opts: PlaceOptions): Placed {
	const gap = opts.gap ?? 6;
	const margin = opts.margin ?? 8;
	const vw = opts.viewport?.width ?? window.innerWidth;
	const vh = opts.viewport?.height ?? window.innerHeight;

	const below = anchor.bottom + gap;
	const above = anchor.top - gap - size.height;
	const fitsBelow = below + size.height <= vh - margin;
	const fitsAbove = above >= margin;
	let placement = opts.placement;
	if (placement === 'bottom' && !fitsBelow && fitsAbove) placement = 'top';
	else if (placement === 'top' && !fitsAbove && fitsBelow) placement = 'bottom';

	let top = placement === 'bottom' ? below : above;
	top = clamp(top, margin, Math.max(margin, vh - margin - size.height));

	let left = opts.align === 'start' ? anchor.left : anchor.right - size.width;
	left = clamp(left, margin, Math.max(margin, vw - margin - size.width));

	return { top, left, placement };
}

/** Clamp a point-anchored box (context menus) inside the viewport. */
export function clampPoint(x: number, y: number, size: { width: number; height: number }, margin = 8): { top: number; left: number } {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	let left = x;
	let top = y;
	if (left + size.width > vw - margin) left = Math.max(margin, x - size.width);
	if (top + size.height > vh - margin) top = Math.max(margin, vh - margin - size.height);
	return { top: Math.max(margin, top), left: Math.max(margin, left) };
}

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

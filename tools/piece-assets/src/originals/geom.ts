/** Tiny path helpers for hand-authored piece sets (100×100 viewBox, centre x = 50). */

export type Pt = [number, number];

const f = (n: number) => +n.toFixed(2);
const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;

/** Catmull-Rom spline through points → cubic Bézier segments (excluding the initial move). */
function spline(points: Pt[], tension = 1): string {
	let d = '';
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i - 1] ?? points[i]!;
		const p1 = points[i]!;
		const p2 = points[i + 1]!;
		const p3 = points[i + 2] ?? p2;
		const c1: Pt = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
		const c2: Pt = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
		d += ` C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
	}
	return d;
}

/**
 * Solid of revolution seen from the side: profile [y, radius] from bottom to top.
 * Bottom and top edges are flat; sides are a smooth spline.
 */
export function lathe(profile: [number, number][], cx = 50, tension = 1): string {
	const left: Pt[] = profile.map(([y, r]) => [cx - r, y]);
	const right: Pt[] = profile.map(([y, r]) => [cx + r, y] as Pt).reverse();
	return `M${pt(left[0]!)}${spline(left, tension)} L${pt(right[0]!)}${spline(right, tension)} Z`;
}

export function circle(cx: number, cy: number, r: number): string {
	return `M${f(cx - r)} ${f(cy)} a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0 Z`;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
	return `M${f(cx - rx)} ${f(cy)} a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0 a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0 Z`;
}

export function rect(x: number, y: number, w: number, h: number, r = 0): string {
	if (!r) return `M${f(x)} ${f(y)} h${f(w)} v${f(h)} h${f(-w)} Z`;
	r = Math.min(r, w / 2, h / 2);
	return `M${f(x + r)} ${f(y)} h${f(w - 2 * r)} a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)} v${f(h - 2 * r)} a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)} h${f(-(w - 2 * r))} a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)} v${f(-(h - 2 * r))} a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)} Z`;
}

/** Polygon through points (straight edges). */
export function poly(points: Pt[]): string {
	return `M${points.map(pt).join(' L')} Z`;
}

/** Closed smooth outline through points. */
export function blob(points: Pt[], tension = 1): string {
	const n = points.length;
	let d = `M${pt(points[0]!)}`;
	for (let i = 0; i < n; i++) {
		const p0 = points[(i - 1 + n) % n]!;
		const p1 = points[i]!;
		const p2 = points[(i + 1) % n]!;
		const p3 = points[(i + 2) % n]!;
		const c1: Pt = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
		const c2: Pt = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
		d += ` C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
	}
	return d + ' Z';
}

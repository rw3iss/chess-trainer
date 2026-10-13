/** Minimal colour helpers for paint classification. */

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

const NAMED: Record<string, string> = {
	white: '#ffffff',
	black: '#000000',
	gray: '#808080',
	grey: '#808080',
	silver: '#c0c0c0',
	red: '#ff0000',
	none: '',
};

export function parseColor(input: string): Rgb | null {
	let s = input.trim().toLowerCase();
	if (s in NAMED) s = NAMED[s] ?? '';
	if (!s) return null;
	let m = /^#([0-9a-f]{3})$/.exec(s);
	if (m) {
		const [r, g, b] = m[1]!.split('').map((c) => parseInt(c + c, 16));
		return { r: r!, g: g!, b: b! };
	}
	m = /^#([0-9a-f]{6})$/.exec(s);
	if (m) {
		const n = parseInt(m[1]!, 16);
		return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
	}
	m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
	if (m) return { r: +m[1]!, g: +m[2]!, b: +m[3]! };
	return null;
}

export function toHex(c: Rgb): string {
	const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
	return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

const lin = (v: number) => {
	const c = v / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** CIE L* (0..100). */
export function lightness(c: Rgb): number {
	const y = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
	return y <= 216 / 24389 ? (y * 24389) / 27 : 116 * Math.cbrt(y) - 16;
}

export function distance(a: Rgb, b: Rgb): number {
	return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

export function mean(colors: Rgb[]): Rgb {
	const n = colors.length || 1;
	const s = colors.reduce((acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }), { r: 0, g: 0, b: 0 });
	return { r: s.r / n, g: s.g / n, b: s.b / n };
}

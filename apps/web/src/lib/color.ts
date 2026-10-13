// Pure colour helpers used by the theme layer and ColorPicker.

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
	return HEX_RE.test(value.trim());
}

/** Expand #abc → #aabbcc; lowercase. Returns null if not a hex colour. */
export function normalizeHex(value: string): string | null {
	const v = value.trim().toLowerCase();
	if (!HEX_RE.test(v)) return null;
	if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
	return v;
}

/** Relative luminance (WCAG) of a hex colour, 0..1. */
export function luminance(hex: string): number {
	const n = normalizeHex(hex);
	if (!n) return 0;
	const ch = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
	const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable foreground (near-black or near-white) for a background colour. */
export function readableOn(hex: string): string {
	return luminance(hex) > 0.45 ? '#16130e' : '#fbf7ef';
}

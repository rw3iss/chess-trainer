// Pure CSS colour ⇄ { hex, alpha } helpers for theme colours that carry
// transparency (board highlights are rgba()).
import { normalizeHex } from '@/lib/color';

export interface HexAlpha {
	hex: string;
	alpha: number;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1);
const toHex2 = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** Parse #rgb, #rrggbb, #rrggbbaa, rgb(), rgba() (comma or space syntax). Null when unsupported. */
export function parseCssColor(value: string): HexAlpha | null {
	const v = value.trim().toLowerCase();
	if (v === 'transparent') return { hex: '#000000', alpha: 0 };
	const hex8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/.exec(v);
	if (hex8) return { hex: `#${hex8[1]}`, alpha: Math.round((parseInt(hex8[2]!, 16) / 255) * 100) / 100 };
	const hex = normalizeHex(v);
	if (hex) return { hex, alpha: 1 };
	const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
	if (!m) return null;
	const [r, g, b] = [m[1], m[2], m[3]].map(Number) as [number, number, number];
	let alpha = 1;
	if (m[4] !== undefined) alpha = m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
	return { hex: `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`, alpha: clamp01(alpha) };
}

/** Hex when opaque, rgba() otherwise. */
export function formatCssColor(hex: string, alpha: number): string {
	const n = normalizeHex(hex) ?? '#000000';
	const a = clamp01(alpha);
	if (a >= 1) return n;
	const r = parseInt(n.slice(1, 3), 16);
	const g = parseInt(n.slice(3, 5), 16);
	const b = parseInt(n.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
}

/** Hex part of any supported colour (for plain hex pickers); fallback when unparsable. */
export function hexOf(value: string, fallback = '#000000'): string {
	return parseCssColor(value)?.hex ?? fallback;
}

import { describe, expect, it } from 'vitest';
import { classifyPaint, normalizePiece } from './normalize.js';
import { parseColor } from './color.js';

const W = { body: '#ffffff', line: '#000000' };
const B = { body: '#000000', line: '#000000', accent: '#ececec' };

describe('classifyPaint', () => {
	it('maps exact anchors to role vars', () => {
		expect(classifyPaint(parseColor('#fff')!, 'fill', W, 'neutral')).toBe('var(--pc-body)');
		expect(classifyPaint(parseColor('#000')!, 'stroke', W, 'neutral')).toBe('var(--pc-line)');
		expect(classifyPaint(parseColor('#eee')!, 'stroke', B, 'neutral')).toBe('var(--pc-accent)');
	});
	it('breaks body/line ties by paint kind', () => {
		expect(classifyPaint(parseColor('#000')!, 'fill', B, 'neutral')).toBe('var(--pc-body)');
		expect(classifyPaint(parseColor('#000')!, 'stroke', B, 'neutral')).toBe('var(--pc-line)');
	});
	it('expresses in-between tones as color-mix of the nearest role', () => {
		expect(classifyPaint(parseColor('#ccc')!, 'fill', W, 'neutral')).toMatch(/^color-mix\(in srgb, var\(--pc-body\), #000 \d+%\)$/);
	});
	it('interpolates between anchors in interpolate mode', () => {
		const v = classifyPaint(parseColor('#808080')!, 'fill', W, 'interpolate');
		expect(v).toMatch(/color-mix\(in srgb, var\(--pc-body\) \d+%, var\(--pc-line\)\)/);
	});
});

describe('normalizePiece', () => {
	const src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">
		<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#999"/></linearGradient></defs>
		<path fill="url(#g)" stroke="#000" d="M10 10h20v20H10z"/>
		<path d="M12 12h5v5h-5z" opacity=".2"/>
		<path fill="#fff" d="M1 1h2v2H1z"/>
	</svg>`;
	const out = normalizePiece(src, { anchors: W, tones: 'neutral', idPrefix: 'x-wP-' });

	it('removes hard-coded colours', () => {
		expect(out.body).not.toMatch(/fill="#/);
		expect(out.body).toContain('var(--pc-line)');
	});
	it('turns gradients into a solid role fill plus a neutral pc-shade overlay', () => {
		expect(out.body).toMatch(/<path[^>]*url\(#x-wP-shade-[^>]*class="pc-shade"/);
		expect(out.body).toContain('id="x-wP-shade-');
	});
	it('tags low-opacity neutral overlays as shade', () => {
		expect(out.body).toMatch(/calc\(0\.2 \* var\(--pc-shade,1\)\)/);
	});
	it('keeps a square viewBox', () => {
		expect(out.viewBox).toBe('0 0 45 45');
		const wide = normalizePiece('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><path d="M0 0h1v1z"/></svg>', { anchors: W, tones: 'neutral', idPrefix: 'p-' });
		expect(wide.viewBox).toBe('0 -5 20 20');
	});
});

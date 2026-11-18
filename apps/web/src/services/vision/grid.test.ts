import { describe, expect, it } from 'vitest';
import { detectGrid, type RgbaImage } from './grid';

/** Deterministic PRNG. */
function rng(seed: number) {
	let s = seed >>> 0;
	return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

interface Scene {
	w: number;
	h: number;
	board: { x: number; y: number; size: number };
	light: [number, number, number];
	dark: [number, number, number];
	seed?: number;
	/** UI clutter around the board. */
	clutter?: boolean;
	/** Board frame width (px) drawn around the squares. */
	frame?: number;
}

function draw(sc: Scene): RgbaImage {
	const { w, h } = sc;
	const data = new Uint8ClampedArray(w * h * 4);
	const r = rng(sc.seed ?? 1);
	const fill = (x0: number, y0: number, x1: number, y1: number, c: readonly number[]) => {
		for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y1)); y++)
			for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) {
				const p = (y * w + x) * 4;
				data[p] = c[0]!;
				data[p + 1] = c[1]!;
				data[p + 2] = c[2]!;
				data[p + 3] = 255;
			}
	};
	fill(0, 0, w, h, [38, 36, 33]);
	if (sc.clutter) {
		// Panels, buttons and "text" lines around.
		for (let i = 0; i < 40; i++) {
			const x = r() * w;
			const y = r() * h;
			const c = [r() * 255, r() * 255, r() * 255];
			fill(x, y, x + 10 + r() * 120, y + 4 + r() * 30, c);
		}
	}
	const { x, y, size } = sc.board;
	const f = sc.frame ?? 0;
	if (f) fill(x - f, y - f, x + size + f, y + size + f, [90, 60, 40]);
	const cell = size / 8;
	for (let row = 0; row < 8; row++)
		for (let col = 0; col < 8; col++) {
			const c = (row + col) % 2 === 0 ? sc.light : sc.dark;
			fill(x + col * cell, y + row * cell, x + (col + 1) * cell, y + (row + 1) * cell, c);
			// A "piece" on about half the squares: a dark or light disc.
			if (r() < 0.5) {
				const pc = r() < 0.5 ? [250, 250, 250] : [20, 20, 20];
				const cx = x + (col + 0.5) * cell;
				const cy = y + (row + 0.5) * cell;
				const rad = cell * 0.35;
				for (let yy = Math.floor(cy - rad); yy < cy + rad; yy++)
					for (let xx = Math.floor(cx - rad); xx < cx + rad; xx++)
						if ((xx - cx) ** 2 + (yy - cy) ** 2 < rad * rad) fill(xx, yy, xx + 1, yy + 1, pc);
			}
		}
	return { width: w, height: h, data };
}

function expectNear(got: ReturnType<typeof detectGrid>, want: Scene['board']) {
	expect(got).not.toBeNull();
	const cell = want.size / 8;
	expect(got!.fallback).toBe(false);
	expect(Math.abs(got!.x - want.x)).toBeLessThan(cell * 0.06);
	expect(Math.abs(got!.y - want.y)).toBeLessThan(cell * 0.06);
	expect(Math.abs(got!.size - want.size)).toBeLessThan(cell * 0.1);
}

describe('detectGrid', () => {
	it('finds a board that fills the image', () => {
		const sc: Scene = { w: 400, h: 400, board: { x: 0, y: 0, size: 400 }, light: [240, 217, 181], dark: [181, 136, 99] };
		expectNear(detectGrid(draw(sc)), sc.board);
	});

	it('finds a board inside a cluttered screenshot, off-center, with a frame', () => {
		const sc: Scene = { w: 720, h: 460, board: { x: 213.5, y: 37.25, size: 384 }, light: [238, 238, 210], dark: [118, 150, 86], clutter: true, frame: 10, seed: 7 };
		expectNear(detectGrid(draw(sc)), sc.board);
	});

	it('finds a small low-contrast board', () => {
		const sc: Scene = { w: 300, h: 220, board: { x: 41, y: 22, size: 168 }, light: [222, 227, 230], dark: [140, 162, 173], clutter: true, seed: 3 };
		expectNear(detectGrid(draw(sc)), sc.board);
	});

	it('falls back to the whole image for a square image without a grid', () => {
		const data = new Uint8ClampedArray(200 * 200 * 4).fill(200);
		const got = detectGrid({ width: 200, height: 200, data });
		expect(got).toMatchObject({ x: 0, y: 0, size: 200, fallback: true });
	});

	it('returns null for a wide image without a grid', () => {
		const data = new Uint8ClampedArray(400 * 100 * 4).fill(200);
		expect(detectGrid({ width: 400, height: 100, data })).toBeNull();
	});
});

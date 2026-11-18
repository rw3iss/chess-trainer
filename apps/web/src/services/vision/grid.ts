// Board grid detection for 2D board images (screenshots, diagrams) — no OpenCV, no model.
//
// A checkerboard's inner grid lines are where the brightness gradient flips sign from one
// square to the next along the line (light→dark, then dark→light). Per column we sum the
// positive and negative horizontal gradients; their geometric mean is high on grid lines and
// low on UI borders (one sign only) and on piece outlines (scattered). The board is then the
// lattice x0 + k·s (k = 1..7 inner lines) with the best line-vs-between contrast. Same for rows,
// restricted to the columns found; a second pass refines both axes inside the board.
// Pure: works on any RGBA buffer (ImageData-like), so it runs in a worker and in unit tests.

export interface RgbaImage {
	width: number;
	height: number;
	/** RGBA, row-major (ImageData.data). */
	data: Uint8ClampedArray | Uint8Array;
}

/** Board square region in image pixels (top-left corner and side length). */
export interface BoardBox {
	x: number;
	y: number;
	size: number;
}

export interface GridResult extends BoardBox {
	/** 0..1 — how clearly the 8×8 grid stands out (≥ ~0.35 is a clear grid). */
	score: number;
	/** True when no grid was found and the whole (near-square) image is used as the board. */
	fallback: boolean;
}

/** Smallest board side we look for, in pixels of the analyzed image. */
const MIN_BOARD = 64;

/** Luma (0..255) of an RGBA buffer. */
export function toGray(img: RgbaImage): Float32Array {
	const { width: w, height: h, data } = img;
	const g = new Float32Array(w * h);
	for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
	return g;
}

/** Gradient below this (gray levels over 2 px) is noise. */
const EDGE_MIN = 6;
/** A run of same-sign gradient may skip this many weak pixels (JPEG noise, anti-aliasing). */
const RUN_GAP = 2;

/**
 * Line evidence per column (axis 'x') or per row (axis 'y'), only over the other axis' range
 * [from, to). Square edges are long straight runs of one gradient sign whose sign flips from
 * square to square; piece outlines are short or curved. So each same-sign run counts with its
 * length squared, and value = sqrt(Σ positive runs² · Σ negative runs²) / span².
 */
export function profile(g: Float32Array, w: number, h: number, axis: 'x' | 'y', from: number, to: number): Float32Array {
	const n = axis === 'x' ? w : h;
	const out = new Float32Array(n);
	const span = Math.max(1, to - from);
	for (let i = 1; i < n - 1; i++) {
		let pos = 0;
		let neg = 0;
		let sign = 0;
		let len = 0;
		let gap = 0;
		const flush = () => {
			if (sign > 0) pos += len * len;
			else if (sign < 0) neg += len * len;
			sign = 0;
			len = 0;
			gap = 0;
		};
		for (let j = from; j < to; j++) {
			const d = axis === 'x' ? g[j * w + i + 1]! - g[j * w + i - 1]! : g[(i + 1) * w + j]! - g[(i - 1) * w + j]!;
			const sg = d > EDGE_MIN ? 1 : d < -EDGE_MIN ? -1 : 0;
			if (sg !== 0 && sg === sign) {
				len += 1 + gap;
				gap = 0;
			} else if (sg === 0 && sign !== 0 && gap < RUN_GAP) {
				gap++;
			} else {
				flush();
				if (sg !== 0) {
					sign = sg;
					len = 1;
				}
			}
		}
		flush();
		out[i] = Math.sqrt(pos * neg) / (span * span);
	}
	return out;
}

/** Linear interpolation into a profile. */
function at(p: Float32Array, x: number): number {
	if (x < 0 || x > p.length - 1) return 0;
	const i = Math.floor(x);
	const f = x - i;
	return i + 1 < p.length ? p[i]! * (1 - f) + p[i + 1]! * f : p[i]!;
}

interface Lattice {
	/** Board start (the outer edge before inner line 1). */
	start: number;
	cell: number;
	score: number;
}

/**
 * Best lattice start + k·cell (k = 1..7 inner lines) in a profile.
 * Score: (mean on lines − mean halfway between lines) / mean on lines, times evenness
 * (the weakest line must still stand out, so 3 strong lines + 4 weak ones do not win).
 */
export function findLattice(p: Float32Array, minCell: number, maxCell: number, step = 0.25): Lattice | null {
	let best: Lattice | null = null;
	const n = p.length;
	let peak = 0;
	for (const v of p) if (v > peak) peak = v;
	if (peak <= 0) return null;
	for (let cell = minCell; cell <= maxCell; cell += step) {
		const maxStart = n - 1 - 7.5 * cell;
		// Coarse start positions, refined below.
		for (let start = -0.5 * cell; start <= maxStart; start += 1) {
			const s = score(p, start, cell, peak);
			if (!best || s > best.score) best = { start, cell, score: s };
		}
	}
	if (!best) return null;
	// Sub-pixel refinement around the best.
	const c0 = best.cell;
	const s0 = best.start;
	for (let cell = c0 - step; cell <= c0 + step; cell += step / 5) {
		for (let start = s0 - 1; start <= s0 + 1; start += 0.1) {
			const s = score(p, start, cell, peak);
			if (s > best.score) best = { start, cell, score: s };
		}
	}
	return best;
}

/** `peak` = strongest line in the profile: weak lattices (noise) score low even with good contrast. */
function score(p: Float32Array, start: number, cell: number, peak: number): number {
	let on = 0;
	let off = 0;
	let weakest = Infinity;
	for (let k = 1; k <= 7; k++) {
		const v = at(p, start + k * cell);
		on += v;
		if (v < weakest) weakest = v;
		off += at(p, start + (k - 0.5) * cell);
	}
	off += at(p, start + 7.5 * cell);
	on /= 7;
	off /= 8;
	if (on <= 1e-6) return 0;
	const contrast = (on - off) / on;
	const evenness = Math.min(1, weakest / (0.5 * on));
	const strength = Math.min(1, on / (0.4 * peak));
	return contrast * evenness * strength;
}

/**
 * Find the 8×8 board in an image. Returns the board box (image pixels) or, when no grid stands
 * out and the image is roughly square, the whole image as a fallback; null when neither.
 */
export function detectGrid(img: RgbaImage): GridResult | null {
	const { width: w, height: h } = img;
	const g = toGray(img);
	const minCell = MIN_BOARD / 8;
	// Only the 7 inner lines must be inside the image (the outer edges may be at or past it).
	const maxCellX = (w - 2) / 7.5;
	const maxCellY = (h - 2) / 7.5;

	if (maxCellX >= minCell && maxCellY >= minCell) {
		// Pass 1: columns over the full height → rows within those columns.
		const vx = findLattice(profile(g, w, h, 'x', 0, h), minCell, maxCellX);
		if (vx) {
			const [cx0, cx1] = clampSpan(vx.start, vx.cell, w);
			const vy = findLattice(profile(g, w, h, 'y', cx0, cx1), Math.max(minCell, vx.cell * 0.9), Math.min(maxCellY, vx.cell * 1.1));
			if (vy) {
				// Pass 2: columns again, within the rows found (drops noise from UI above/below).
				const [ry0, ry1] = clampSpan(vy.start, vy.cell, h);
				const vx2 = findLattice(profile(g, w, h, 'x', ry0, ry1), Math.max(minCell, vy.cell * 0.97), Math.min(maxCellX, vy.cell * 1.03), 0.1) ?? vx;
				const s = Math.min(vx2.score, vy.score);
				if (s >= 0.2) {
					const cell = (vx2.cell + vy.cell) / 2;
					// An outer edge next to UI can look like an inner line: try the grid shifted by one
					// square each way and keep the one whose squares best follow the light/dark pattern.
					let best = { x: vx2.start, y: vy.start, fit: checkerFit(g, w, h, vx2.start, vy.start, cell) };
					for (const dx of [-1, 0, 1])
						for (const dy of [-1, 0, 1]) {
							if (!dx && !dy) continue;
							const x = vx2.start + dx * cell;
							const y = vy.start + dy * cell;
							const fit = checkerFit(g, w, h, x, y, cell);
							if (fit > best.fit + 0.05) best = { x, y, fit };
						}
					if (best.fit >= 0.6) return { x: best.x, y: best.y, size: 8 * cell, score: Math.min(1, s) * best.fit, fallback: false };
				}
			}
		}
	}
	// No clear grid: accept a near-square image as the board itself.
	const aspect = w / h;
	if (aspect > 0.85 && aspect < 1.18) {
		const size = Math.min(w, h);
		return { x: (w - size) / 2, y: (h - size) / 2, size, score: 0, fallback: true };
	}
	return null;
}

/**
 * Share (0..1) of the 64 cells whose background matches their shade: per cell, the median of four
 * corner patches (pieces rarely reach the corners); light and dark shades = medians per parity.
 * Cells outside the image count as misses.
 */
export function checkerFit(g: Float32Array, w: number, h: number, x0: number, y0: number, cell: number): number {
	const patch = Math.max(1, Math.round(cell * 0.12));
	const inset = Math.max(1, Math.round(cell * 0.08));
	const bg = new Float32Array(64).fill(NaN);
	for (let r = 0; r < 8; r++)
		for (let c = 0; c < 8; c++) {
			const cx = Math.round(x0 + c * cell);
			const cy = Math.round(y0 + r * cell);
			const n = Math.round(cell);
			if (cx < 0 || cy < 0 || cx + n > w || cy + n > h) continue;
			const vals: number[] = [];
			for (const [px, py] of [
				[cx + inset, cy + inset],
				[cx + n - inset - patch, cy + inset],
				[cx + inset, cy + n - inset - patch],
				[cx + n - inset - patch, cy + n - inset - patch],
			] as const) {
				let sum = 0;
				for (let y = py; y < py + patch; y++) for (let x = px; x < px + patch; x++) sum += g[y * w + x]!;
				vals.push(sum / (patch * patch));
			}
			vals.sort((a, b) => a - b);
			bg[r * 8 + c] = (vals[1]! + vals[2]!) / 2;
		}
	const shade = [0, 1].map((parity) => {
		const v: number[] = [];
		for (let i = 0; i < 64; i++) if ((Math.floor(i / 8) + (i % 8)) % 2 === parity && !Number.isNaN(bg[i]!)) v.push(bg[i]!);
		v.sort((a, b) => a - b);
		return v.length ? v[Math.floor(v.length / 2)]! : NaN;
	});
	const gap = Math.abs(shade[0]! - shade[1]!);
	if (!(gap >= 8)) return 0;
	let hits = 0;
	for (let i = 0; i < 64; i++) {
		const v = bg[i]!;
		if (Number.isNaN(v)) continue;
		const own = shade[(Math.floor(i / 8) + (i % 8)) % 2]!;
		if (Math.abs(v - own) < gap / 3) hits++;
	}
	return hits / 64;
}

/** Board span [from, to) on one axis, clamped to the image. */
function clampSpan(start: number, cell: number, n: number): [number, number] {
	return [Math.max(0, Math.round(start)), Math.min(n, Math.round(start + 8 * cell))];
}

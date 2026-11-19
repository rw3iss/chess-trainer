// Board-image worker: image → grid → 64 tiles → piece classifier (onnxruntime-web, WASM) → position.
// Message in:  { id, image: Blob }
// Message out: { id, result: VisionResult } | { id, error: string }
// The model (public/models/board-vision/, built by tools/board-vision) and the ORT wasm are
// fetched on first use and cached by the service worker ('chess-engines-v1', CacheFirst).
import { analyzeBoard, PIECE_CLASSES, type CellColor, type SquareRead } from './analyze';
import { detectGrid } from './grid';
import { MODEL_META_URL, modelUrl, type ModelMeta, type VisionResult } from './types';

type Ort = typeof import('onnxruntime-web/wasm');

interface WorkerScope {
	addEventListener(type: 'message', fn: (e: MessageEvent<{ id: number; image: Blob }>) => void): void;
	postMessage(msg: unknown): void;
	crossOriginIsolated?: boolean;
}
const scope = self as unknown as WorkerScope;

/** Longest side of the image used for grid detection (speed; the tiles come from the full image). */
const DETECT_MAX = 720;

let model: Promise<{ ort: Ort; session: import('onnxruntime-web/wasm').InferenceSession; meta: ModelMeta }> | null = null;

function loadModel() {
	model ??= (async () => {
		const ortP = import('onnxruntime-web/wasm');
		const meta = await fetch(MODEL_META_URL).then((r) => {
			if (!r.ok) throw new Error(`board model info: HTTP ${r.status}`);
			return r.json() as Promise<ModelMeta>;
		});
		// The model file keeps its name across exports; the version query gives each export its own cache entry.
		const bytes = await fetch(modelUrl(meta)).then((r) => {
			if (!r.ok) throw new Error(`board model: HTTP ${r.status}`);
			return r.arrayBuffer();
		});
		const ort = await ortP;
		if (meta.classes.join(',') !== PIECE_CLASSES.join(',')) throw new Error('board model: unexpected classes');
		const hc = navigator.hardwareConcurrency || 1;
		ort.env.wasm.numThreads = scope.crossOriginIsolated ? Math.min(4, hc) : 1;
		const session = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'] });
		return { ort, session, meta };
	})().catch((e: unknown) => {
		model = null;
		throw e;
	});
	return model;
}

function canvas2d(w: number, h: number): OffscreenCanvasRenderingContext2D {
	const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('2D canvas unavailable');
	return ctx;
}

/** Median of the four corner patches' mean colors (pieces rarely reach the corners; one corner may hold a coordinate). */
function cellBackground(px: Uint8ClampedArray, n: number): CellColor {
	const patch = Math.max(2, Math.round(n * 0.12));
	const off = Math.max(1, Math.round(n * 0.06));
	const corners = [
		[off, off],
		[n - off - patch, off],
		[off, n - off - patch],
		[n - off - patch, n - off - patch],
	] as const;
	const means = corners.map(([x0, y0]) => {
		let r = 0;
		let g = 0;
		let b = 0;
		for (let y = y0; y < y0 + patch; y++)
			for (let x = x0; x < x0 + patch; x++) {
				const p = (y * n + x) * 4;
				r += px[p]!;
				g += px[p + 1]!;
				b += px[p + 2]!;
			}
		const k = patch * patch;
		return { r: r / k, g: g / k, b: b / k };
	});
	const med = (key: keyof CellColor) => {
		const v = means.map((m) => m[key]).sort((a, c) => a - c);
		return (v[1]! + v[2]!) / 2;
	};
	return { r: med('r'), g: med('g'), b: med('b') };
}

async function read(image: Blob): Promise<VisionResult> {
	const bmp = await createImageBitmap(image);
	try {
		const t0 = performance.now();
		// 1. Grid on a downscaled copy.
		const scale = Math.min(1, DETECT_MAX / Math.max(bmp.width, bmp.height));
		const dw = Math.max(1, Math.round(bmp.width * scale));
		const dh = Math.max(1, Math.round(bmp.height * scale));
		const dctx = canvas2d(dw, dh);
		dctx.imageSmoothingQuality = 'high';
		dctx.drawImage(bmp, 0, 0, dw, dh);
		const grid = detectGrid(dctx.getImageData(0, 0, dw, dh));
		if (!grid) throw new Error('No chess board found in this image.');
		const box = { x: grid.x / scale, y: grid.y / scale, size: grid.size / scale };

		// 2. 64 tiles from the full image, resampled to the model's input size.
		const { ort, session, meta } = await loadModel();
		const n = meta.inputSize;
		const cell = box.size / 8;
		const tctx = canvas2d(n, n);
		tctx.imageSmoothingQuality = 'high';
		const input = new Float32Array(64 * 3 * n * n);
		const bg: CellColor[] = [];
		const plane = n * n;
		for (let i = 0; i < 64; i++) {
			const sx = box.x + (i % 8) * cell;
			const sy = box.y + Math.floor(i / 8) * cell;
			tctx.clearRect(0, 0, n, n);
			tctx.drawImage(bmp, sx, sy, cell, cell, 0, 0, n, n);
			const px = tctx.getImageData(0, 0, n, n).data;
			const base = i * 3 * plane;
			for (let j = 0; j < plane; j++) {
				input[base + j] = px[j * 4]! / 255;
				input[base + plane + j] = px[j * 4 + 1]! / 255;
				input[base + 2 * plane + j] = px[j * 4 + 2]! / 255;
			}
			bg.push(cellBackground(px, n));
		}

		// 3. Classify.
		const out = await session.run({ input: new ort.Tensor('float32', input, [64, 3, n, n]) });
		const logits = out.logits!.data as Float32Array;
		const k = PIECE_CLASSES.length;
		const cells: SquareRead[] = [];
		for (let i = 0; i < 64; i++) {
			let max = -Infinity;
			let arg = 0;
			for (let c = 0; c < k; c++) {
				const v = logits[i * k + c]!;
				if (v > max) {
					max = v;
					arg = c;
				}
			}
			let sum = 0;
			for (let c = 0; c < k; c++) sum += Math.exp(logits[i * k + c]! - max);
			cells.push({ cls: PIECE_CLASSES[arg]!, p: 1 / sum });
		}

		// 4. Position.
		return {
			...analyzeBoard(cells, bg),
			board: box,
			gridScore: grid.score,
			gridFallback: grid.fallback,
			image: { width: bmp.width, height: bmp.height },
			ms: Math.round(performance.now() - t0),
		};
	} finally {
		bmp.close();
	}
}

scope.addEventListener('message', (e) => {
	const { id, image } = e.data;
	read(image).then(
		(result) => scope.postMessage({ id, result }),
		(err: unknown) => scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) }),
	);
});

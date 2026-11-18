// Read a chess position from a 2D board image (screenshot / diagram) — fully in the browser.
// Pipeline (vision.worker.ts): grid detection (grid.ts) → 64 tiles → ONNX piece classifier
// (onnxruntime-web WASM) → orientation, side to move, castling (analyze.ts).
import type { VisionResult } from './types';

export type { VisionResult } from './types';
export { PIECE_CLASSES, UNCERTAIN_BELOW } from './analyze';

type Reply = { id: number; result: VisionResult } | { id: number; error: string };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: VisionResult) => void; reject: (e: Error) => void }>();

/** Image types the reader accepts. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';

export function isImageFile(f: { type: string; name?: string }): boolean {
	return f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name ?? '');
}

/** The browser has what the reader needs (Worker + OffscreenCanvas + createImageBitmap). */
export function isVisionSupported(): boolean {
	return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';
}

function getWorker(): Worker {
	if (worker) return worker;
	const w = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module', name: 'board-vision' });
	w.addEventListener('message', (e: MessageEvent<Reply>) => {
		const p = pending.get(e.data.id);
		if (!p) return;
		pending.delete(e.data.id);
		if ('error' in e.data) p.reject(new Error(e.data.error));
		else p.resolve(e.data.result);
	});
	w.addEventListener('error', (e) => {
		const err = new Error(e.message || 'Board reader failed');
		pending.forEach((p) => p.reject(err));
		pending.clear();
		w.terminate();
		worker = null;
	});
	worker = w;
	return w;
}

/** Read the position from a board image. Rejects with a user-facing message when no board is found. */
export function readBoardImage(image: Blob): Promise<VisionResult> {
	if (!isVisionSupported()) return Promise.reject(new Error('This browser cannot read board images.'));
	const w = getWorker();
	const id = ++seq;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		w.postMessage({ id, image });
	});
}

import type { BoardRead } from './analyze';
import type { BoardBox } from './grid';

/** Piece classifier (tools/board-vision). Cached by the service worker on first use. */
export const MODEL_URL = '/models/board-vision/pieces-v1.onnx';
export const MODEL_META_URL = '/models/board-vision/pieces-v1.json';

export interface ModelMeta {
	version: number;
	/** Tile side in pixels (model input is [N, 3, inputSize, inputSize], RGB 0..1). */
	inputSize: number;
	classes: string[];
}

/** Result of reading a board image. */
export interface VisionResult extends BoardRead {
	/** Board region in the original image's pixels. */
	board: BoardBox;
	/** 0..1 grid clarity; 0 with `gridFallback` (whole image used as the board). */
	gridScore: number;
	gridFallback: boolean;
	image: { width: number; height: number };
	/** Time spent in the worker (without the first model load). */
	ms: number;
}

// Avatar image prep (client side): center-crop to a square, resize to AVATAR_SIZE px and encode as WebP
// (PNG/JPEG fallback when the browser cannot encode WebP), small enough for the server (≤ AVATAR_MAX_BYTES).
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 300 * 1024;
export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';

/** Largest centered square inside w × h. */
export function centerSquare(w: number, h: number): { sx: number; sy: number; size: number } {
	const size = Math.max(1, Math.min(w, h));
	return { sx: Math.max(0, Math.floor((w - size) / 2)), sy: Math.max(0, Math.floor((h - size) / 2)), size };
}

interface Drawable {
	width: number;
	height: number;
	close?: () => void;
}

/** Minimal canvas surface (HTMLCanvasElement / OffscreenCanvas / test fake). */
export interface AvatarCanvas {
	getContext(id: '2d'): { drawImage(img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void; imageSmoothingQuality?: string } | null;
	toBlob(type: string, quality?: number): Promise<Blob | null>;
}

export interface AvatarDeps {
	decode: (file: Blob) => Promise<Drawable>;
	canvas: (size: number) => AvatarCanvas;
}

const defaultDeps = (): AvatarDeps => ({
	decode: (file) => createImageBitmap(file),
	canvas: (size) => {
		const c = document.createElement('canvas');
		c.width = size;
		c.height = size;
		return {
			getContext: (id) => c.getContext(id) as ReturnType<AvatarCanvas['getContext']>,
			toBlob: (type, quality) => new Promise((resolve) => c.toBlob(resolve, type, quality)),
		};
	},
});

/** Encodings to try, best first. Browsers that cannot encode a type return PNG (or null) instead. */
const ENCODINGS: [string, number | undefined][] = [
	['image/webp', 0.86],
	['image/webp', 0.7],
	['image/jpeg', 0.85],
	['image/jpeg', 0.7],
	['image/png', undefined],
];

/** Crop + resize an image file into an avatar blob. Rejects with a user-facing message. */
export async function prepareAvatar(file: Blob, deps: AvatarDeps = defaultDeps(), size = AVATAR_SIZE): Promise<Blob> {
	let img: Drawable;
	try {
		img = await deps.decode(file);
	} catch {
		throw new Error('That file is not an image this browser can read.');
	}
	try {
		const { sx, sy, size: side } = centerSquare(img.width, img.height);
		const canvas = deps.canvas(size);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('This browser cannot resize images.');
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
		for (const [type, quality] of ENCODINGS) {
			// oxlint-disable-next-line no-await-in-loop -- try encodings in order, stop at the first that fits
			const blob = await canvas.toBlob(type, quality);
			if (blob && blob.size > 0 && blob.size <= AVATAR_MAX_BYTES && /^image\/(webp|jpeg|png)$/.test(blob.type)) return blob;
		}
		throw new Error('The image is too large even after resizing. Try another one.');
	} finally {
		img.close?.();
	}
}

import { describe, expect, it, vi } from 'vitest';
import { AVATAR_MAX_BYTES, centerSquare, prepareAvatar, type AvatarCanvas } from './avatarImage';

describe('avatar image', () => {
	it('centerSquare crops the middle square', () => {
		expect(centerSquare(400, 300)).toEqual({ sx: 50, sy: 0, size: 300 });
		expect(centerSquare(200, 500)).toEqual({ sx: 0, sy: 150, size: 200 });
		expect(centerSquare(256, 256)).toEqual({ sx: 0, sy: 0, size: 256 });
	});

	const fakeCanvas = (blobs: (Blob | null)[]) => {
		const drawImage = vi.fn();
		const toBlob = vi.fn(async () => blobs.shift() ?? null);
		const canvas: AvatarCanvas = { getContext: () => ({ drawImage }), toBlob };
		return { canvas, drawImage, toBlob };
	};

	it('draws the center square at 256 px and returns the first encoding that fits', async () => {
		const close = vi.fn();
		const { canvas, drawImage, toBlob } = fakeCanvas([new Blob(['x'], { type: 'image/webp' })]);
		const out = await prepareAvatar(new Blob(['img']), { decode: async () => ({ width: 800, height: 600, close }), canvas: () => canvas });
		expect(out.type).toBe('image/webp');
		expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 600, 600, 0, 0, 256, 256);
		expect(toBlob).toHaveBeenCalledWith('image/webp', 0.86);
		expect(close).toHaveBeenCalled();
	});

	it('falls back when WebP is not supported or too big', async () => {
		const big = new Blob([new Uint8Array(AVATAR_MAX_BYTES + 1)], { type: 'image/webp' });
		const png = new Blob(['p'], { type: 'image/png' });
		// Safari-style: asking for WebP yields PNG — accepted since PNG is allowed.
		const { canvas, toBlob } = fakeCanvas([big, big, null, null, png]);
		const out = await prepareAvatar(new Blob(['img']), { decode: async () => ({ width: 10, height: 10 }), canvas: () => canvas });
		expect(out).toBe(png);
		expect(toBlob).toHaveBeenCalledTimes(5);
	});

	it('rejects unreadable files with a readable message', async () => {
		await expect(prepareAvatar(new Blob(['no']), { decode: async () => Promise.reject(new Error('bad')), canvas: () => fakeCanvas([]).canvas })).rejects.toThrow(/not an image/);
	});
});

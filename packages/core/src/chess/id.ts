const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';

interface CryptoLike {
	getRandomValues?: <T extends Uint8Array>(array: T) => T;
}

/**
 * Short random id (nanoid-like, 64-char alphabet). Uses `crypto.getRandomValues`
 * when available, otherwise `Math.random`.
 */
export function newId(size = 10): string {
	const bytes = new Uint8Array(size);
	const c = (globalThis as { crypto?: CryptoLike }).crypto;
	if (c?.getRandomValues) {
		c.getRandomValues(bytes);
	} else {
		for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256);
	}
	let id = '';
	for (let i = 0; i < size; i++) id += ALPHABET[bytes[i]! & 63];
	return id;
}

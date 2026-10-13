const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Short random id for user-created themes, e.g. `board-k3j9x2ab`. */
export function newThemeId(prefix: string): string {
	const bytes = new Uint8Array(8);
	const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
	if (c?.getRandomValues) c.getRandomValues(bytes);
	else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
	let out = '';
	for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
	return `${prefix}-${out}`;
}

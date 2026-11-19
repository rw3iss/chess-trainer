/** Avatar bytes storage port. DiskAvatarStore today; an object store later — callers never change. */
export abstract class AvatarStore {
	abstract put(userId: string, type: AvatarType, bytes: Buffer): Promise<void>;
	/** null when missing. */
	abstract get(userId: string, type: AvatarType): Promise<Buffer | null>;
	abstract remove(userId: string): Promise<void>;
}

export type AvatarType = 'png' | 'jpeg' | 'webp';

export const AVATAR_MAX_BYTES = 300 * 1024;

/** Image type from magic bytes (never trust the declared content type). */
export function sniffAvatarType(b: Buffer): AvatarType | null {
	if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
	if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
	if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
	return null;
}

import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { AvatarStore, type AvatarType } from './avatar-store';

/** Files `<dir>/<userId>.<type>` (user ids are UUIDs: safe file names). */
export class DiskAvatarStore extends AvatarStore {
	constructor(private readonly dir: string) {
		super();
	}

	async put(userId: string, type: AvatarType, bytes: Buffer): Promise<void> {
		await mkdir(this.dir, { recursive: true });
		await this.remove(userId);
		await writeFile(join(this.dir, `${safe(userId)}.${type}`), bytes);
	}

	async get(userId: string, type: AvatarType): Promise<Buffer | null> {
		return readFile(join(this.dir, `${safe(userId)}.${type}`)).catch(() => null);
	}

	async remove(userId: string): Promise<void> {
		await Promise.all(['png', 'jpeg', 'webp'].map((t) => rm(join(this.dir, `${safe(userId)}.${t}`), { force: true })));
	}
}

function safe(id: string): string {
	if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) throw new Error('bad user id');
	return id;
}

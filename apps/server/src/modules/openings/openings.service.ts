import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

/** Read-only access to the static openings dataset in DATA_DIR. */
@Injectable()
export class OpeningsService {
	readonly dataDir: string;

	constructor(config: ConfigService) {
		this.dataDir = config.get<string>('openings.dataDir')!;
	}

	/** True when DATA_DIR/<file> exists (caller validates the name). */
	has(file: string): boolean {
		return existsSync(join(this.dataDir, file));
	}

	/** Parsed manifest.json. Re-read per call so a rebuilt dataset shows up without restart. */
	async manifest(): Promise<unknown> {
		try {
			return JSON.parse(await readFile(join(this.dataDir, 'manifest.json'), 'utf8'));
		} catch {
			throw new NotFoundException(`no openings dataset in ${this.dataDir}`);
		}
	}
}

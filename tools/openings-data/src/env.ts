import { existsSync, readFileSync } from 'node:fs';
import { ENV_FILE } from './paths.js';

/** Read a key from process.env or the root .env (simple KEY=value parser). Never logs values. */
export function readEnv(key: string, file = ENV_FILE): string | undefined {
	if (process.env[key]) return process.env[key];
	if (!existsSync(file)) return undefined;
	for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
		if (m && m[1] === key) return m[2]!.replace(/^(['"])(.*)\1$/, '$2');
	}
	return undefined;
}

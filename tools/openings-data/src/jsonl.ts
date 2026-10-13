import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

/** Read a JSON-lines cache file (missing file → []). Tolerates a truncated last line. */
export function readJsonl<T>(path: string): T[] {
	if (!existsSync(path)) return [];
	const out: T[] = [];
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		try {
			out.push(JSON.parse(line) as T);
		} catch {
			/* partial write from an interrupted run */
		}
	}
	return out;
}

export function appendJsonl(path: string, rows: unknown[]): void {
	if (!rows.length) return;
	mkdirSync(dirname(path), { recursive: true });
	let prefix = '';
	if (existsSync(path)) {
		const size = statSync(path).size;
		if (size > 0) {
			const fd = openSync(path, 'r');
			const b = Buffer.alloc(1);
			readSync(fd, b, 0, 1, size - 1);
			closeSync(fd);
			if (b[0] !== 0x0a) prefix = '\n';
		}
	}
	appendFileSync(path, prefix + rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

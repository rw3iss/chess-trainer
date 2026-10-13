import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC_CACHE, USER_AGENT } from './paths.js';
import { ECO_JSON_FILES, ECO_JSON_URL, LICHESS_FILES, LICHESS_URL } from './sources.js';

/** Download the Lichess TSVs and eco.json files into .cache/src (skips files already present unless `force`). */
export async function downloadSources(force = false): Promise<void> {
	mkdirSync(SRC_CACHE, { recursive: true });
	const jobs = [...LICHESS_FILES.map((f) => [f, LICHESS_URL(f)]), ...ECO_JSON_FILES.map((f) => [f, ECO_JSON_URL(f)])];
	for (const [file, url] of jobs) {
		const path = resolve(SRC_CACHE, file!);
		if (!force && existsSync(path)) continue;
		const res = await fetch(url!, { headers: { 'User-Agent': USER_AGENT } });
		if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
		writeFileSync(path, await res.text());
		console.log(`downloaded ${file}`);
	}
}

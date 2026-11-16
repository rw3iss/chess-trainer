/**
 * One command for the whole openings data refresh:
 *   1. download sources (Lichess TSV, eco.json, scid.eco; `--refresh-sources` re-downloads),
 *   2. crawl new Wikibooks pages for named lines,
 *   3. fetch Wikibooks notes for new positions,
 *   4. fetch Lichess + masters stats for positions without them (`--max-age-days N` refreshes old ones),
 *   5. build the shipped files.
 * Every step is incremental and resumable (caches in .cache/). `--skip-notes` / `--skip-stats` skip the slow steps.
 * Usage: pnpm data:ingest [--refresh-sources] [--max-age-days N] [--skip-notes] [--skip-stats]
 */
import { spawnSync } from 'node:child_process';
import { TOOL_DIR } from './paths.js';

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const value = (f: string) => {
	const i = argv.indexOf(f);
	return i >= 0 ? argv[i + 1] : undefined;
};

function step(title: string, script: string, args: string[] = []): void {
	console.log(`\n▶ ${title}`);
	const r = spawnSync('npx', ['tsx', `src/${script}`, ...args], { cwd: TOOL_DIR, stdio: 'inherit' });
	if (r.status !== 0) throw new Error(`${title} failed (exit ${r.status})`);
}

const maxAge = value('--max-age-days');
step('Sources + first build', 'build.ts', has('--refresh-sources') ? ['--refresh-sources'] : []);
step('Wikibooks named lines', 'wikibooks-lines.ts');
if (!has('--skip-notes')) step('Wikibooks notes', 'notes.ts');
if (!has('--skip-stats')) step('Lichess + masters stats', 'popularity.ts', maxAge ? ['--max-age-days', maxAge] : []);
step('Build', 'build.ts');
console.log('\n✅ ingest complete — commit apps/web/public/data');

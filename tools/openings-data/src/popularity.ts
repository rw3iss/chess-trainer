/**
 * Fetch Lichess Opening Explorer stats for every opening's final position.
 * Order: Lichess-TSV openings × /lichess, Lichess-TSV × /masters, eco.json extras × /lichess, extras × /masters.
 * ~1 request / 1.5–2.5 s; 429 → backoff. Resumable: results append to .cache/popularity/<endpoint>.jsonl.
 * Token: LICHESS_TOKEN from env or the repo-root .env.
 * Usage: pnpm --filter @chess/openings-data popularity [--only lichess|masters] [--source lichess|eco.json] [--limit N]
 */
import { downloadSources } from './download.js';
import { readEnv } from './env.js';
import { Throttle, politeGet } from './http.js';
import { appendJsonl } from './jsonl.js';
import { mergeOpenings } from './merge.js';
import { POP_FILE, explorerUrl, loadPopCache, type Endpoint } from './popularity-lib.js';
import { loadSources } from './sources.js';

const arg = (name: string) => {
	const i = process.argv.indexOf(name);
	return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
	const token = readEnv('LICHESS_TOKEN');
	if (!token) throw new Error('LICHESS_TOKEN not set (env or repo-root .env)');
	const only = arg('--only') as Endpoint | undefined;
	const onlySource = arg('--source');
	const limit = Number(arg('--limit') ?? Infinity);

	await downloadSources();
	const { lichess, eco } = loadSources();
	const { openings } = mergeOpenings(lichess, eco);
	// One query per distinct final EPD, using the first (canonical-source) line that reaches it.
	const firstByEpd = new Map<string, { uci: string[]; source: string }>();
	for (const { entry } of [...openings].sort((a, b) => (a.entry.source === 'lichess' ? 0 : 1) - (b.entry.source === 'lichess' ? 0 : 1) || a.entry.plies - b.entry.plies)) {
		if (!firstByEpd.has(entry.epd)) firstByEpd.set(entry.epd, { uci: entry.uci, source: entry.source });
	}
	const throttle = new Throttle(1500, 2500);
	const phases: [string, Endpoint][] = [
		['lichess', 'lichess'],
		['lichess', 'masters'],
		['eco.json', 'lichess'],
		['eco.json', 'masters'],
	];
	let requests = 0;
	for (const [source, ep] of phases) {
		if (only && ep !== only) continue;
		if (onlySource && source !== onlySource) continue;
		const cache = loadPopCache(ep);
		const todo = [...firstByEpd].filter(([epd, v]) => v.source === source && !cache.has(epd));
		console.log(`[${source} × /${ep}] ${todo.length} to fetch (${cache.size} cached) ~${Math.round((todo.length * 2) / 60)} min`);
		let done = 0;
		for (const [epd, { uci }] of todo) {
			if (requests >= limit) return console.log('limit reached');
			requests++;
			const res = await politeGet(explorerUrl(ep, uci), throttle, { Authorization: `Bearer ${token}` });
			if (!res.ok) {
				console.log(`  ${res.status} for ${uci.join(' ')} — skipped`);
				await res.body?.cancel().catch(() => {});
				continue;
			}
			const d = (await res.json()) as { white: number; draws: number; black: number };
			appendJsonl(POP_FILE(ep), [{ epd, white: d.white ?? 0, draws: d.draws ?? 0, black: d.black ?? 0, t: Date.now() }]);
			if (++done % 50 === 0) console.log(`  ${done}/${todo.length}`);
		}
	}
	console.log('popularity fetch complete');
}

main().catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});

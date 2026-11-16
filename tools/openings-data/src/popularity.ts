/**
 * Fetch Lichess Opening Explorer stats for every opening's final position.
 * Stats are cached per final position (EPD), so a new or changed opening line fetches only its new
 * position; unchanged ones are reused. `--max-age-days N` also refetches rows older than N days.
 * Order: by name source (lichess, eco.json, scid, wikibooks), each × /lichess then /masters.
 * ~1 request / 1.5–2.5 s; 429 → backoff. Resumable: results append to .cache/popularity/<endpoint>.jsonl.
 * Token: LICHESS_TOKEN from env or the repo-root .env.
 * Usage: pnpm --filter @chess/openings-data popularity [--only lichess|masters] [--source <tag>] [--limit N] [--max-age-days N]
 */
import { downloadSources } from './download.js';
import { readEnv } from './env.js';
import { Throttle, politeGet } from './http.js';
import { appendJsonl } from './jsonl.js';
import { mergeOpenings } from './merge.js';
import { POP_FILE, explorerUrl, loadPopCache, type Endpoint } from './popularity-lib.js';
import { SOURCE_ORDER, loadSources, type SourceTag } from './sources.js';

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
	const maxAgeDays = Number(arg('--max-age-days') ?? Infinity);
	const staleBefore = Date.now() - maxAgeDays * 86_400_000;

	await downloadSources();
	const { lichess, eco, scid, wikibooks } = loadSources();
	const { openings } = mergeOpenings(lichess, eco, [...scid, ...wikibooks]);
	// One query per distinct final EPD, using the first (canonical-source) line that reaches it.
	const firstByEpd = new Map<string, { uci: string[]; source: string }>();
	const rank = (src: string) => SOURCE_ORDER.indexOf(src as SourceTag);
	for (const { entry } of [...openings].sort((a, b) => rank(a.entry.source) - rank(b.entry.source) || a.entry.plies - b.entry.plies)) {
		if (!firstByEpd.has(entry.epd)) firstByEpd.set(entry.epd, { uci: entry.uci, source: entry.source });
	}
	const throttle = new Throttle(1500, 2500);
	const phases: [string, Endpoint][] = SOURCE_ORDER.flatMap((src) => [
		[src, 'lichess'],
		[src, 'masters'],
	]);
	let requests = 0;
	for (const [source, ep] of phases) {
		if (only && ep !== only) continue;
		if (onlySource && source !== onlySource) continue;
		const cache = loadPopCache(ep);
		const fresh = (epd: string) => {
			const row = cache.get(epd);
			return !!row && row.t >= staleBefore;
		};
		const todo = [...firstByEpd].filter(([epd, v]) => v.source === source && !fresh(epd));
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

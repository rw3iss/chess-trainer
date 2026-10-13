/**
 * Fetch Wikibooks "Chess Opening Theory" pages for every opening path prefix.
 * Phase 1: existence/redirect check, 50 titles per request, breadth-first by ply (children are
 *          only checked when the parent page exists).
 * Phase 2: plain-text extract per existing page (MediaWiki returns one full extract per request).
 * Resumable: results append to .cache/notes/*.jsonl; re-running skips cached titles.
 * Usage: pnpm --filter @chess/openings-data notes [--max-ply N]
 */
import { downloadSources } from './download.js';
import { appendJsonl } from './jsonl.js';
import { mergeOpenings } from './merge.js';
import { EXTRACT_CACHE, INFO_CACHE, WIKIBOOKS_API, collectPrefixes, loadNotesCache, type InfoRow } from './notes-lib.js';
import { loadSources } from './sources.js';
import { Throttle, politeGet } from './http.js';

const throttle = new Throttle(550, 750); // ≤ 2 req/s

interface QueryResponse {
	query?: {
		normalized?: { from: string; to: string }[];
		redirects?: { from: string; to: string }[];
		pages?: { title: string; missing?: boolean; invalid?: boolean; length?: number; extract?: string }[];
	};
}

async function api(params: Record<string, string>): Promise<QueryResponse> {
	const url = WIKIBOOKS_API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params }).toString();
	const res = await politeGet(url, throttle, {}, { rateLimitWaitMs: 30_000 });
	if (!res.ok) throw new Error(`Wikibooks ${res.status}`);
	return (await res.json()) as QueryResponse;
}

async function checkTitles(titles: string[]): Promise<InfoRow[]> {
	const data = await api({ action: 'query', prop: 'info', redirects: '1', titles: titles.join('|') });
	const q = data.query ?? {};
	const norm = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
	const redir = new Map((q.redirects ?? []).map((n) => [n.from, n.to]));
	const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
	return titles.map((title) => {
		let t = norm.get(title) ?? title;
		for (let i = 0; i < 5 && redir.has(t); i++) t = redir.get(t)!;
		const page = pages.get(t);
		if (!page || page.missing || page.invalid) return { title, exists: false };
		return { title, exists: true, resolved: t, length: page.length };
	});
}

/** ≤ 50 titles and ≤ ~5000 URL chars per request. */
function batches(titles: string[]): string[][] {
	const out: string[][] = [];
	let cur: string[] = [];
	let len = 0;
	for (const t of titles) {
		const l = encodeURIComponent(t).length + 3;
		if (cur.length && (cur.length >= 50 || len + l > 5000)) {
			out.push(cur);
			cur = [];
			len = 0;
		}
		cur.push(t);
		len += l;
	}
	if (cur.length) out.push(cur);
	return out;
}

async function main() {
	const maxPlyArg = process.argv.indexOf('--max-ply');
	const maxPly = maxPlyArg > 0 ? Number(process.argv[maxPlyArg + 1]) : Infinity;
	await downloadSources();
	const { lichess, eco } = loadSources();
	const { openings } = mergeOpenings(lichess, eco);
	const prefixes = collectPrefixes(openings);
	const cache = loadNotesCache();
	const deepest = Math.min(maxPly, Math.max(...[...prefixes.values()].map((p) => p.sans.length)));
	console.log(`${prefixes.size} path prefixes, ${cache.info.size} titles already checked, ${cache.extracts.size} extracts cached`);

	// Phase 1 — existence, breadth-first.
	for (let ply = 1; ply <= deepest; ply++) {
		const level = [...prefixes.values()].filter((p) => p.sans.length === ply);
		const candidates = level.filter((p) => {
			if (ply === 1) return true;
			const parent = cache.info.get(p.title.slice(0, p.title.lastIndexOf('/')));
			return parent?.exists === true;
		});
		const todo = candidates.filter((p) => !cache.info.has(p.title)).map((p) => p.title);
		console.log(`ply ${ply}: ${level.length} prefixes, ${candidates.length} under existing parents, ${todo.length} to check`);
		for (const batch of batches(todo)) {
			const rows = await checkTitles(batch);
			appendJsonl(INFO_CACHE, rows);
			for (const r of rows) cache.info.set(r.title, r);
		}
		const found = candidates.filter((p) => cache.info.get(p.title)?.exists).length;
		console.log(`  ply ${ply}: ${found} pages exist`);
		if (!found) break;
	}

	// Phase 2 — extracts for distinct resolved pages.
	const resolved = [...new Set([...cache.info.values()].filter((r) => r.exists && r.resolved).map((r) => r.resolved!))];
	const todo = resolved.filter((t) => !cache.extracts.has(t));
	console.log(`${resolved.length} distinct pages, ${todo.length} extracts to fetch (~${Math.round((todo.length * 0.65) / 60)} min)`);
	let done = 0;
	for (const title of todo) {
		const data = await api({ action: 'query', prop: 'extracts', explaintext: '1', exsectionformat: 'wiki', titles: title });
		const page = data.query?.pages?.[0];
		const extract = page && !page.missing ? (page.extract ?? '') : '';
		appendJsonl(EXTRACT_CACHE, [{ title, extract }]);
		cache.extracts.set(title, extract);
		if (++done % 100 === 0) console.log(`  extracts ${done}/${todo.length}`);
	}
	console.log('notes fetch complete');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

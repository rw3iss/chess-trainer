/**
 * Crawl the Wikibooks "Chess Opening Theory" page tree for named lines (see wikibooks-lib.ts).
 * Lists every page (cheap), then reads the wikitext of pages not cached yet, 50 per request, ≤ 2 req/s.
 * Resumable: rows append to .cache/wikibooks/pages.jsonl. `--refresh` re-reads every page.
 * Usage: pnpm --filter @chess/openings-data wikibooks [--refresh]
 */
import { Throttle, politeGet } from './http.js';
import { appendJsonl, readJsonl } from './jsonl.js';
import { WIKIBOOKS_API } from './notes-lib.js';
import { WIKI_HEAD_CHARS, WIKI_PAGES_FILE, WIKI_PREFIX, pageName, titleToSans, type WikiPageRow } from './wikibooks-lib.js';

const throttle = new Throttle(550, 750);

async function api<T>(params: Record<string, string>): Promise<T> {
	const url = WIKIBOOKS_API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params }).toString();
	const res = await politeGet(url, throttle, {}, { rateLimitWaitMs: 30_000 });
	if (!res.ok) throw new Error(`Wikibooks ${res.status}`);
	return (await res.json()) as T;
}

async function listPages(): Promise<string[]> {
	const titles: string[] = [];
	let cont: string | undefined;
	do {
		const d = await api<{ query: { allpages: { title: string }[] }; continue?: { apcontinue: string } }>({
			action: 'query',
			list: 'allpages',
			apprefix: WIKI_PREFIX,
			apnamespace: '0',
			apfilterredir: 'nonredirects',
			aplimit: 'max',
			...(cont ? { apcontinue: cont } : {}),
		});
		titles.push(...d.query.allpages.map((p) => p.title));
		cont = d.continue?.apcontinue;
	} while (cont);
	return titles;
}

async function main() {
	const refresh = process.argv.includes('--refresh');
	const all = (await listPages()).filter((t) => titleToSans(t));
	// Rows from before `head` was cached are re-read once.
	const cached = new Set(refresh ? [] : readJsonl<WikiPageRow>(WIKI_PAGES_FILE).filter((r) => r.head !== undefined).map((r) => r.title));
	const todo = all.filter((t) => !cached.has(t));
	console.log(`wikibooks: ${all.length} move pages, ${todo.length} to read (~${Math.round((todo.length / 50) * 0.7 / 60)} min)`);
	let named = 0;
	// ≤ 50 titles and ≤ ~5000 URL characters per request (long move paths overflow the URL).
	const batches: string[][] = [];
	let cur: string[] = [];
	let len = 0;
	for (const t of todo) {
		const l = encodeURIComponent(t).length + 3;
		if (cur.length && (cur.length >= 50 || len + l > 5000)) {
			batches.push(cur);
			cur = [];
			len = 0;
		}
		cur.push(t);
		len += l;
	}
	if (cur.length) batches.push(cur);
	let done = 0;
	for (const [bi, batch] of batches.entries()) {
		const d = await api<{ query?: { pages?: { title: string; revisions?: { slots?: { main?: { content?: string } } }[] }[] } }>({
			action: 'query',
			prop: 'revisions',
			rvprop: 'content',
			rvslots: 'main',
			titles: batch.join('|'),
		});
		const rows: WikiPageRow[] = (d.query?.pages ?? []).map((p) => {
			const head = (p.revisions?.[0]?.slots?.main?.content ?? '').slice(0, WIKI_HEAD_CHARS);
			if (pageName(head)) named++;
			return { title: p.title, head, t: Date.now() };
		});
		appendJsonl(WIKI_PAGES_FILE, rows);
		done += batch.length;
		if (bi % 20 === 0) console.log(`  ${done}/${todo.length} (${named} with a name)`);
	}
	console.log(`wikibooks crawl complete (${named} new pages with a name)`);
}

main().catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});

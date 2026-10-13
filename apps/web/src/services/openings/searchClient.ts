// Openings search client. Runs the engine in a Web Worker (off the main thread)
// when available; falls back to an in-process engine (tests, worker failure).
//
//   const search = createOpeningSearch(entries, rawJsonText);
//   const indices = await search.query({ q: 'e4 c5 Nf3' }, { favoriteIds });
import type { OpeningEntry } from '@chess/core/openings';
import { createSearchEngine, type OpeningQuery, type QueryContext, type SearchEngine } from './searchCore';
import type { SearchRequest, SearchResponse } from './protocol';

export interface OpeningSearch {
	readonly mode: 'worker' | 'local';
	query(query: OpeningQuery, ctx?: QueryContext): Promise<Int32Array>;
	dispose(): void;
}

export interface OpeningSearchOptions {
	/** Force the in-process engine. Default: worker when `Worker` exists and `text` is given. */
	local?: boolean;
	/** Worker factory (tests / custom bundling). */
	createWorker?: () => Worker;
}

function localSearch(entries: readonly OpeningEntry[]): OpeningSearch {
	let engine: SearchEngine | null = null;
	return {
		mode: 'local',
		query: async (q, ctx) => (engine ??= createSearchEngine(entries)).query(q, ctx),
		dispose: () => {
			engine = null;
		},
	};
}

const defaultWorker = (): Worker => new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module', name: 'openings-search' });

export function createOpeningSearch(entries: readonly OpeningEntry[], text?: string, opts: OpeningSearchOptions = {}): OpeningSearch {
	if (opts.local || !text || typeof Worker === 'undefined') return localSearch(entries);
	let worker: Worker;
	try {
		worker = (opts.createWorker ?? defaultWorker)();
	} catch {
		return localSearch(entries);
	}

	let fallback: OpeningSearch | null = null;
	let seq = 0;
	const pending = new Map<number, { query: OpeningQuery; ctx?: QueryContext; resolve: (v: Int32Array) => void; reject: (e: Error) => void }>();

	const failOver = (reason: string) => {
		if (fallback) return;
		console.warn('[openings] search worker unavailable, searching on the main thread:', reason);
		worker.terminate();
		fallback = localSearch(entries);
		for (const [, p] of pending) fallback.query(p.query, p.ctx).then(p.resolve, p.reject);
		pending.clear();
	};

	worker.onmessage = (e: MessageEvent<SearchResponse>) => {
		const msg = e.data;
		if (msg.type === 'result') {
			pending.get(msg.id)?.resolve(msg.indices);
			pending.delete(msg.id);
		} else if (msg.type === 'error') {
			if (msg.id === undefined) failOver(msg.message);
			else {
				pending.get(msg.id)?.reject(new Error(msg.message));
				pending.delete(msg.id);
			}
		}
	};
	worker.onerror = (e) => {
		e.preventDefault?.();
		failOver(e.message || 'worker error');
	};
	worker.postMessage({ type: 'init', text } satisfies SearchRequest);

	return {
		get mode() {
			return fallback ? 'local' : 'worker';
		},
		query(query, ctx = {}) {
			if (fallback) return fallback.query(query, ctx);
			const id = ++seq;
			return new Promise<Int32Array>((resolve, reject) => {
				pending.set(id, { query, ctx, resolve, reject });
				// Plain copies: signals' Sets/proxies must not cross the structured clone.
				const msg: SearchRequest = { type: 'query', id, query: { ...query }, ctx: { favoriteIds: [...(ctx.favoriteIds ?? [])], recentIds: [...(ctx.recentIds ?? [])] } };
				worker.postMessage(msg);
			});
		},
		dispose() {
			worker.terminate();
			for (const [, p] of pending) p.reject(new Error('search disposed'));
			pending.clear();
		},
	};
}

// Openings search Web Worker: parses the openings JSON, builds the MiniSearch
// index once, then answers queries with index arrays (transferred, zero-copy).
import type { OpeningsFile } from '@chess/core/openings';
import { createSearchEngine, type SearchEngine } from './searchCore';
import type { SearchRequest, SearchResponse } from './protocol';

interface WorkerScope {
	onmessage: ((e: MessageEvent<SearchRequest>) => void) | null;
	postMessage(msg: SearchResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
let engine: SearchEngine | null = null;

scope.onmessage = (e) => {
	const msg = e.data;
	try {
		if (msg.type === 'init') {
			const file = JSON.parse(msg.text) as OpeningsFile;
			engine = createSearchEngine(file.openings);
			scope.postMessage({ type: 'ready', count: file.openings.length });
			return;
		}
		if (!engine) throw new Error('search index not initialised');
		const indices = engine.query(msg.query, msg.ctx);
		scope.postMessage({ type: 'result', id: msg.id, indices }, [indices.buffer]);
	} catch (err) {
		scope.postMessage({ type: 'error', id: msg.type === 'query' ? msg.id : undefined, message: (err as Error).message });
	}
};

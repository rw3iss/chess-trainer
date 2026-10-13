// Message protocol between the main thread and the openings search worker.
import type { OpeningQuery, QueryContext } from './searchCore';

export type SearchRequest =
	| { type: 'init'; text: string }
	| { type: 'query'; id: number; query: OpeningQuery; ctx: QueryContext };

export type SearchResponse =
	| { type: 'ready'; count: number }
	| { type: 'result'; id: number; indices: Int32Array }
	| { type: 'error'; id?: number; message: string };

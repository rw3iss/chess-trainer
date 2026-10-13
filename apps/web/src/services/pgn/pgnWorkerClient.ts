// Main-thread client for the PGN worker. Lazily spawns one worker; falls back to
// parsing on the main thread where Workers are unavailable (tests, old browsers).
import { parsePgnImports, type ImportedGame } from './pgnImport';

type Reply = { id: number; games: ImportedGame[] } | { id: number; error: string };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (g: ImportedGame[]) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
	if (worker) return worker;
	if (typeof Worker === 'undefined') return null;
	try {
		worker = new Worker(new URL('./pgn.worker.ts', import.meta.url), { type: 'module', name: 'pgn-import' });
	} catch {
		return null;
	}
	worker.addEventListener('message', (e: MessageEvent<Reply>) => {
		const p = pending.get(e.data.id);
		if (!p) return;
		pending.delete(e.data.id);
		if ('error' in e.data) p.reject(new Error(e.data.error));
		else p.resolve(e.data.games);
	});
	worker.addEventListener('error', (e) => {
		const err = new Error(e.message || 'PGN worker failed');
		pending.forEach((p) => p.reject(err));
		pending.clear();
		worker?.terminate();
		worker = null;
	});
	return worker;
}

/** Parse PGN text off the main thread. */
export function parsePgn(text: string): Promise<ImportedGame[]> {
	const w = getWorker();
	if (!w) return Promise.resolve().then(() => parsePgnImports(text));
	const id = ++seq;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		w.postMessage({ id, text });
	});
}

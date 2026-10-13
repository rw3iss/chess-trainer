// PGN import worker — parses large multi-game PGN off the main thread.
// Message in:  { id: number, text: string }
// Message out: { id, games: ImportedGame[] } | { id, error: string }
import { parsePgnImports } from './pgnImport';

interface WorkerScope {
	addEventListener(type: 'message', fn: (e: MessageEvent<{ id: number; text: string }>) => void): void;
	postMessage(msg: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener('message', (e) => {
	const { id, text } = e.data;
	try {
		scope.postMessage({ id, games: parsePgnImports(text) });
	} catch (err) {
		scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
	}
});

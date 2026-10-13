import type { WorkerLike } from './types';

type Listener = (line: string) => void;

interface Waiter {
	match: (line: string) => boolean;
	resolve: (line: string) => void;
	reject: (err: Error) => void;
	timer?: ReturnType<typeof setTimeout>;
}

/**
 * Line-oriented UCI channel over a Worker (or any WorkerLike). Splits messages
 * into lines, fans them out to listeners, and supports awaiting a specific line
 * (`uciok`, `readyok`, `bestmove …`). A worker error rejects every pending wait.
 */
export class UciEngine {
	/** Option names announced by the engine (`option name X type …`). */
	readonly options = new Set<string>();
	engineName = '';
	private readonly listeners = new Set<Listener>();
	private readonly waiters = new Set<Waiter>();
	private fatal: Error | null = null;

	constructor(
		private readonly worker: WorkerLike,
		private readonly onFatal?: (err: Error) => void,
	) {
		worker.onmessage = (ev) => {
			const data = ev.data;
			if (typeof data !== 'string') return;
			for (const raw of data.split('\n')) {
				const line = raw.trim();
				if (line) this.dispatch(line);
			}
		};
		worker.onerror = (ev) => {
			const msg = (ev as { message?: string } | null)?.message;
			this.fail(new Error(`engine worker error${msg ? `: ${msg}` : ''}`));
		};
	}

	get failed(): Error | null {
		return this.fatal;
	}

	send(cmd: string): void {
		if (this.fatal) throw this.fatal;
		this.worker.postMessage(cmd);
	}

	onLine(fn: Listener): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	/** Resolves with the first line matching `match` (after this call). */
	waitFor(match: (line: string) => boolean, timeoutMs?: number): Promise<string> {
		if (this.fatal) return Promise.reject(this.fatal);
		return new Promise<string>((resolve, reject) => {
			const w: Waiter = { match, resolve, reject };
			if (timeoutMs !== undefined) {
				w.timer = setTimeout(() => {
					this.waiters.delete(w);
					reject(new Error(`engine did not respond within ${timeoutMs} ms`));
				}, timeoutMs);
			}
			this.waiters.add(w);
		});
	}

	/** `uci` → `uciok`, then `isready` → `readyok`. Collects option names. */
	async handshake(timeoutMs = 30_000): Promise<void> {
		const off = this.onLine((line) => {
			if (line.startsWith('id name ')) this.engineName = line.slice(8);
			const m = /^option name (.+?) type /.exec(line);
			if (m) this.options.add(m[1]!);
		});
		try {
			const ok = this.waitFor((l) => l === 'uciok', timeoutMs);
			this.send('uci');
			await ok;
			await this.isReady(timeoutMs);
		} finally {
			off();
		}
	}

	async isReady(timeoutMs = 30_000): Promise<void> {
		const ok = this.waitFor((l) => l === 'readyok', timeoutMs);
		this.send('isready');
		await ok;
	}

	terminate(): void {
		this.fail(new Error('engine terminated'), false);
		this.worker.onmessage = null;
		this.worker.onerror = null;
		this.worker.terminate();
	}

	private dispatch(line: string): void {
		for (const fn of this.listeners) fn(line);
		for (const w of this.waiters) {
			if (w.match(line)) {
				this.waiters.delete(w);
				if (w.timer) clearTimeout(w.timer);
				w.resolve(line);
			}
		}
	}

	private fail(err: Error, notify = true): void {
		if (this.fatal) return;
		this.fatal = err;
		for (const w of this.waiters) {
			if (w.timer) clearTimeout(w.timer);
			w.reject(err);
		}
		this.waiters.clear();
		if (notify) this.onFatal?.(err);
	}
}

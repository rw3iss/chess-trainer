import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { createInterface } from 'readline';
import { parseBestMove, parseInfoLine, setOptionCommands, type EngineInfo, type Uci } from '@chess/core';

export interface UciSpawnSpec {
	path: string;
	args?: string[];
}

export interface SearchResult {
	uci: Uci;
	ponder?: Uci;
	/** Last scored `info` line seen for multipv 1. */
	info?: EngineInfo;
}

/**
 * One UCI engine child process. All I/O is async (child stdio + readline),
 * so engines never block the event loop.
 *
 * Lifecycle: `start()` (spawn + `uci`/`uciok` + `isready`/`readyok`) →
 * any number of `setOptions` / `search` / `stop` → `quit()`.
 * One search at a time; starting a search while one runs stops the old one first.
 *
 * Events: 'line' (raw stdout line), 'exit' (code).
 */
export class UciProcess extends EventEmitter {
	private child?: ChildProcessWithoutNullStreams;
	private waiters: { match: (line: string) => boolean; resolve: (line: string) => void; reject: (e: Error) => void }[] = [];
	private search?: { onInfo?: (i: EngineInfo) => void; lastInfo?: EngineInfo; resolve: (r: SearchResult) => void; reject: (e: Error) => void };
	/** Option names advertised by the engine (`option name … type …`). */
	readonly options = new Set<string>();
	name = '';
	lastUsedAt = Date.now();
	private exited = false;

	constructor(
		readonly spec: UciSpawnSpec,
		private readonly timeoutMs = 10_000,
	) {
		super();
	}

	get alive(): boolean {
		return !!this.child && !this.exited;
	}

	get searching(): boolean {
		return !!this.search;
	}

	/** Spawns the binary and completes the UCI handshake. Rejects (and kills) on timeout / early exit. */
	async start(): Promise<void> {
		const child = spawn(this.spec.path, this.spec.args ?? [], { stdio: ['pipe', 'pipe', 'pipe'] });
		this.child = child;
		child.on('error', (err) => this.fail(err));
		child.on('exit', (code) => {
			this.exited = true;
			this.fail(new Error(`engine exited (code ${code})`));
			this.emit('exit', code);
		});
		child.stdin.on('error', () => undefined); // EPIPE after exit is handled by 'exit'
		child.stderr.resume();
		createInterface({ input: child.stdout }).on('line', (line) => this.onLine(line));

		try {
			const uciok = this.waitFor((l) => l === 'uciok');
			this.send('uci');
			await uciok;
			await this.isReady();
		} catch (err) {
			this.quit();
			throw err;
		}
	}

	send(cmd: string): void {
		if (!this.alive) throw new Error('engine not running');
		this.lastUsedAt = Date.now();
		this.child!.stdin.write(cmd + '\n');
	}

	/** `isready` → waits for `readyok`. */
	async isReady(): Promise<void> {
		const ok = this.waitFor((l) => l === 'readyok');
		this.send('isready');
		await ok;
	}

	/** Sends `setoption` for each option the engine supports (unknown names are skipped). */
	setOptions(options: Record<string, string | number | boolean>): void {
		const known = this.options.size
			? Object.fromEntries(Object.entries(options).filter(([k]) => this.options.has(k.toLowerCase())))
			: options;
		for (const cmd of setOptionCommands(known)) this.send(cmd);
	}

	/**
	 * Sends `positionCmd` + `goCmd`; resolves at `bestmove`. `onInfo` receives every
	 * scored info line. A running search is stopped (and its promise resolved) first.
	 */
	async go(positionCmd: string, goCmd: string, onInfo?: (info: EngineInfo) => void): Promise<SearchResult> {
		if (this.search) {
			const prev = this.stopAndWait();
			await prev.catch(() => undefined);
		}
		const result = new Promise<SearchResult>((resolve, reject) => {
			this.search = { onInfo, resolve, reject };
		});
		this.send(positionCmd);
		this.send(goCmd);
		return result;
	}

	/** Asks the engine to stop; the pending `go()` resolves with its bestmove. */
	stop(): void {
		if (this.search && this.alive) this.send('stop');
	}

	private stopAndWait(): Promise<SearchResult> {
		const s = this.search!;
		const p = new Promise<SearchResult>((resolve, reject) => {
			const prevResolve = s.resolve;
			const prevReject = s.reject;
			s.resolve = (r) => {
				prevResolve(r);
				resolve(r);
			};
			s.reject = (e) => {
				prevReject(e);
				reject(e);
			};
		});
		this.stop();
		return p;
	}

	/** Polite quit, then SIGKILL if the process lingers. */
	quit(): void {
		if (!this.child || this.exited) return;
		try {
			this.child.stdin.write('quit\n');
		} catch {
			/* ignore */
		}
		const child = this.child;
		setTimeout(() => {
			if (!this.exited) child.kill('SIGKILL');
		}, 500).unref();
	}

	private onLine(raw: string): void {
		const line = raw.trim();
		if (!line) return;
		this.emit('line', line);

		if (line.startsWith('id name ')) this.name = line.slice(8);
		else if (line.startsWith('option name ')) {
			const m = /^option name (.+?) type /.exec(line);
			if (m) this.options.add(m[1]!.toLowerCase());
		}

		if (this.search) {
			if (line.startsWith('info ')) {
				const info = parseInfoLine(line);
				if (info) {
					if (info.multipv === 1) this.search.lastInfo = info;
					this.search.onInfo?.(info);
				}
			} else if (line.startsWith('bestmove')) {
				const s = this.search;
				this.search = undefined;
				const best = parseBestMove(line);
				if (best) s.resolve({ ...best, info: s.lastInfo });
				else s.reject(new Error('engine returned no move'));
			}
		}

		const matched = this.waiters.filter((w) => w.match(line));
		if (matched.length) {
			this.waiters = this.waiters.filter((w) => !matched.includes(w));
			for (const w of matched) w.resolve(line);
		}
	}

	private waitFor(match: (line: string) => boolean): Promise<string> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiters = this.waiters.filter((w) => w !== waiter);
				reject(new Error(`engine timeout after ${this.timeoutMs}ms`));
			}, this.timeoutMs);
			const waiter = {
				match,
				resolve: (l: string) => {
					clearTimeout(timer);
					resolve(l);
				},
				reject: (e: Error) => {
					clearTimeout(timer);
					reject(e);
				},
			};
			this.waiters.push(waiter);
		});
	}

	private fail(err: Error): void {
		for (const w of this.waiters.splice(0)) w.reject(err);
		if (this.search) {
			const s = this.search;
			this.search = undefined;
			s.reject(err);
		}
	}
}

import { Logger } from '@nestjs/common';
import type { EngineSpec } from './engine-specs';
import { UciProcess } from './uci-process';

export class PoolExhaustedError extends Error {}

interface Entry {
	proc: UciProcess;
	engineId: string;
	owner: string | null;
}

/**
 * Pool of UCI processes across all engines.
 * - `acquire` reuses an idle process of the same engine or spawns one, up to `maxProcesses`.
 * - `release` returns a process to the idle set (`ucinewgame`); idle ones are reaped after `idleTimeoutMs`.
 * - `releaseOwner` kills everything an owner (socket) holds — used on disconnect.
 *
 * (Deleting from a Set while iterating it with for…of is safe in JS.)
 */
export class EnginePool {
	private readonly logger = new Logger('EnginePool');
	private readonly entries = new Set<Entry>();
	private readonly reaper: NodeJS.Timeout;

	constructor(
		private readonly maxProcesses: number,
		private readonly idleTimeoutMs: number,
		private readonly factory: (spec: EngineSpec) => UciProcess = (spec) => new UciProcess({ path: spec.path!, args: spec.args }),
	) {
		this.reaper = setInterval(() => this.reap(), Math.min(30_000, idleTimeoutMs)).unref();
	}

	get size(): number {
		return this.entries.size;
	}

	countOwned(owner: string): number {
		let n = 0;
		for (const e of this.entries) if (e.owner === owner) n++;
		return n;
	}

	async acquire(spec: EngineSpec, owner: string): Promise<UciProcess> {
		for (const e of this.entries) {
			if (e.owner === null && e.engineId === spec.meta.id && e.proc.alive) {
				e.owner = owner;
				e.proc.lastUsedAt = Date.now();
				return e.proc;
			}
		}
		if (this.entries.size >= this.maxProcesses) {
			// Make room by killing the oldest idle process of another engine.
			let idle: Entry | undefined;
			for (const e of this.entries) if (e.owner === null && (!idle || e.proc.lastUsedAt < idle.proc.lastUsedAt)) idle = e;
			if (!idle) throw new PoolExhaustedError(`all ${this.maxProcesses} engine processes are busy`);
			this.kill(idle);
		}
		const proc = this.factory(spec);
		const entry: Entry = { proc, engineId: spec.meta.id, owner };
		this.entries.add(entry);
		proc.on('exit', () => this.entries.delete(entry));
		try {
			await proc.start();
			proc.setOptions(spec.initOptions);
			await proc.isReady();
		} catch (err) {
			this.kill(entry);
			throw err;
		}
		this.logger.log(`spawned ${spec.meta.id} (${proc.name || spec.path}) — ${this.entries.size}/${this.maxProcesses}`);
		return proc;
	}

	/** Returns a process to the idle set (stops any search). */
	release(proc: UciProcess): void {
		const e = this.find(proc);
		if (!e) return;
		if (!proc.alive) return this.kill(e);
		proc.stop();
		try {
			proc.send('ucinewgame');
		} catch {
			return this.kill(e);
		}
		e.owner = null;
		proc.lastUsedAt = Date.now();
	}

	/** Kills every process held by `owner`. */
	releaseOwner(owner: string): void {
		for (const e of this.entries) if (e.owner === owner) this.kill(e);
	}

	shutdown(): void {
		clearInterval(this.reaper);
		for (const e of this.entries) this.kill(e);
	}

	private find(proc: UciProcess): Entry | undefined {
		for (const e of this.entries) if (e.proc === proc) return e;
		return undefined;
	}

	private kill(e: Entry): void {
		this.entries.delete(e);
		e.proc.quit();
	}

	/** Kills processes idle (owned or not) longer than idleTimeoutMs. */
	reap(now = Date.now()): void {
		for (const e of this.entries) {
			if (!e.proc.searching && now - e.proc.lastUsedAt > this.idleTimeoutMs) {
				this.logger.log(`reaping idle ${e.engineId}`);
				this.kill(e);
			}
		}
	}
}

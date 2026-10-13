import { EngineAbortError } from './types';

export type JobKind = 'play' | 'analyze' | 'cmd';

export interface Job {
	readonly kind: JobKind;
	cancelled: boolean;
	/** Called once when a running job is cancelled (e.g. send `stop`). */
	onCancel?: () => void;
}

/**
 * Serial FIFO of engine jobs. A new play/analyze request cancels every
 * analysis (running or queued), so a stale infinite search never blocks a
 * bot move. Cancelled jobs that have not started reject with EngineAbortError.
 */
export class JobQueue {
	private tail: Promise<unknown> = Promise.resolve();
	private readonly jobs = new Set<Job>();
	private running: Job | null = null;

	get busy(): boolean {
		return this.jobs.size > 0;
	}

	get current(): Job | null {
		return this.running;
	}

	enqueue<T>(kind: JobKind, run: (job: Job) => Promise<T>, onCreate?: (job: Job) => void): Promise<T> {
		const job: Job = { kind, cancelled: false };
		onCreate?.(job);
		if (kind !== 'cmd') {
			for (const other of this.jobs) if (other.kind === 'analyze') this.cancel(other);
		}
		this.jobs.add(job);
		const result = this.tail.then(async () => {
			try {
				if (job.cancelled) throw new EngineAbortError();
				this.running = job;
				return await run(job);
			} finally {
				this.jobs.delete(job);
				if (this.running === job) this.running = null;
			}
		});
		this.tail = result.catch(() => undefined);
		return result;
	}

	cancel(job: Job): void {
		if (job.cancelled) return;
		job.cancelled = true;
		if (this.running === job) job.onCancel?.();
	}

	cancelAll(): void {
		for (const job of this.jobs) this.cancel(job);
	}
}

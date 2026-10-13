// SyncService — pushes local saved games + sessions to the optional server and
// merges the reply (POST /sync, LWW + tombstones; see apps/server/DESIGN.md).
//
// Framework-free (signals only); every dependency is injected so tests can use a
// fake api and fresh repositories. The app instance lives in ./index.ts.
//
// Runs only while `account` is set (logged in), `online` and `enabled`:
//   periodically (intervalMs), when the gate opens (enable/login/online), and
//   debounced after local changes (watch signals). Merges are applied with the
//   `applying` flag set so they do not count as local changes.
import { effect, signal, type ReadonlySignal } from '@preact/signals';
import type { SavedGame, Session } from '@chess/core/game';
import type { SyncRequest, SyncResponse } from '@chess/core/protocol';
import type { KvRepository } from '@/services/db';
import { debounce } from '@/lib/throttle';
import { mergeSync, type SyncDoc } from './merge';

export const SYNC_STATE_KEY = 'sync:state';
export const SYNC_INTERVAL_MS = 2 * 60_000;
export const SYNC_DEBOUNCE_MS = 3_000;

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'disabled' | 'offline';

/** Persisted in kv under SYNC_STATE_KEY. */
export interface SyncState {
	/** Account the state belongs to (`${serverUrl}|${userId}`); another account starts fresh. */
	account: string;
	/** serverTime of the last response — sent as the next `since`. */
	since?: string;
	/** Local clock mark taken at the start of the last successful sync. */
	lastPushAt: number;
	/** Local ids after the last sync — ids missing now become tombstones. */
	knownSavedGameIds: string[];
	knownSessionIds: string[];
	/** Local time the last sync finished. */
	lastSyncAt?: number;
}

/** How the service reads and writes one local document store. */
export interface SyncStoreAdapter<T extends SyncDoc> {
	/** Current local documents (already filtered to the syncable ones). */
	list(): readonly T[];
	/** Apply merged remote changes to the store. */
	apply(upserts: T[], deletes: string[]): Promise<void>;
	/** Reading `.value` subscribes to local changes. */
	watch: ReadonlySignal<unknown>;
}

export interface SyncDeps {
	sync(req: SyncRequest): Promise<SyncResponse>;
	kv(): KvRepository;
	savedGames: SyncStoreAdapter<SavedGame>;
	sessions: SyncStoreAdapter<Session>;
	/** Fresh access token before each request (null = signed out). */
	ensureToken(): Promise<string | null>;
	/** Logged-in account key, null when signed out. */
	account: ReadonlySignal<string | null>;
	/** Server reachable. */
	online: ReadonlySignal<boolean>;
	/** User setting `server.sync`. */
	enabled: ReadonlySignal<boolean>;
	now?: () => number;
	intervalMs?: number;
	debounceMs?: number;
}

function message(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function missing(known: readonly string[], present: Set<string>): string[] {
	return known.filter((id) => !present.has(id));
}

/**
 * Ids to remember after a sync: what is present now, plus ids sent in this round
 * that were deleted locally meanwhile (so the next round sends their tombstone).
 */
function knownAfter(sent: readonly SyncDoc[], now: readonly SyncDoc[], remoteDeletes: readonly string[]): string[] {
	const ids = new Set(now.map((d) => d.id));
	const dropped = new Set(remoteDeletes);
	for (const d of sent) if (!dropped.has(d.id)) ids.add(d.id);
	return [...ids];
}

export class SyncService {
	private readonly _status = signal<SyncStatus>('disabled');
	private readonly _lastSyncAt = signal<number | null>(null);
	private readonly _lastError = signal<string | null>(null);

	readonly status: ReadonlySignal<SyncStatus> = this._status;
	readonly lastSyncAt: ReadonlySignal<number | null> = this._lastSyncAt;
	readonly lastError: ReadonlySignal<string | null> = this._lastError;

	private applying = false;
	private running: Promise<void> | null = null;
	private rerun = false;
	private timer: ReturnType<typeof setInterval> | null = null;
	private disposers: (() => void)[] = [];
	private readonly scheduleChange: ReturnType<typeof debounce<[]>>;

	constructor(private readonly deps: SyncDeps) {
		this.scheduleChange = debounce(() => void this.syncNow(), deps.debounceMs ?? SYNC_DEBOUNCE_MS);
	}

	private now(): number {
		return (this.deps.now ?? Date.now)();
	}

	/** Why sync cannot run right now, or null when it can. */
	private gate(): Extract<SyncStatus, 'disabled' | 'offline'> | null {
		if (!this.deps.enabled.value || !this.deps.account.value) return 'disabled';
		if (!this.deps.online.value) return 'offline';
		return null;
	}

	get isApplying(): boolean {
		return this.applying;
	}

	/** Start watchers + periodic sync. Idempotent. */
	start(): void {
		if (this.disposers.length) return;
		// Gate transitions: closed → status; opened → sync now.
		let wasReady = false;
		this.disposers.push(
			effect(() => {
				const blocked = this.gate();
				if (blocked) {
					wasReady = false;
					this.scheduleChange.cancel();
					if (this._status.peek() !== 'syncing') this._status.value = blocked;
					return;
				}
				if (!wasReady) {
					wasReady = true;
					if (this._status.peek() === 'disabled' || this._status.peek() === 'offline') this._status.value = 'idle';
					void this.syncNow();
				}
			}),
		);
		// Local changes (skipped while applying a merge) → debounced sync.
		let first = true;
		this.disposers.push(
			effect(() => {
				void this.deps.savedGames.watch.value;
				void this.deps.sessions.watch.value;
				if (first) {
					first = false;
					return;
				}
				if (this.applying || this.gate()) return;
				this.scheduleChange();
			}),
		);
		this.timer = setInterval(() => void this.syncNow(), this.deps.intervalMs ?? SYNC_INTERVAL_MS);
	}

	stop(): void {
		for (const d of this.disposers) d();
		this.disposers = [];
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.scheduleChange.cancel();
	}

	/** Run one sync (joins a running one and queues one more pass). Resolves when done; never rejects. */
	syncNow(): Promise<void> {
		if (this.running) {
			this.rerun = true;
			return this.running;
		}
		this.running = (async () => {
			try {
				do {
					this.rerun = false;
					// oxlint-disable-next-line no-await-in-loop -- passes must run one after another
					await this.runOnce();
				} while (this.rerun && !this.gate());
			} finally {
				this.running = null;
			}
		})();
		return this.running;
	}

	/** Forget the persisted sync state (next sync is a full one). */
	async reset(): Promise<void> {
		await this.deps.kv().remove(SYNC_STATE_KEY);
		this._lastSyncAt.value = null;
	}

	private async loadState(account: string): Promise<SyncState> {
		const stored = await this.deps.kv().get<SyncState>(SYNC_STATE_KEY);
		if (stored && stored.account === account) return stored;
		return { account, lastPushAt: 0, knownSavedGameIds: [], knownSessionIds: [] };
	}

	private async runOnce(): Promise<void> {
		const blocked = this.gate();
		const account = this.deps.account.value;
		if (blocked || !account) {
			this._status.value = blocked ?? 'disabled';
			return;
		}
		this._status.value = 'syncing';
		try {
			const state = await this.loadState(account);
			if (this._lastSyncAt.peek() === null && state.lastSyncAt) this._lastSyncAt.value = state.lastSyncAt;
			const token = await this.deps.ensureToken();
			if (!token) {
				this._status.value = 'disabled';
				return;
			}

			const mark = this.now();
			const games = this.deps.savedGames.list();
			const sessions = this.deps.sessions.list();
			const req: SyncRequest = {
				savedGames: games.filter((g) => g.updatedAt >= state.lastPushAt),
				sessions: sessions.filter((s) => s.updatedAt >= state.lastPushAt),
				deletedSavedGameIds: missing(state.knownSavedGameIds, new Set(games.map((g) => g.id))),
				deletedSessionIds: missing(state.knownSessionIds, new Set(sessions.map((s) => s.id))),
			};
			if (state.since) req.since = state.since;

			const res = await this.deps.sync(req);
			// Merge against the stores as they are now (the user may have edited meanwhile).
			const merged = mergeSync({ savedGames: this.deps.savedGames.list(), sessions: this.deps.sessions.list() }, res, state.lastPushAt);
			this.applying = true;
			try {
				if (merged.savedGames.upserts.length || merged.savedGames.deletes.length) {
					await this.deps.savedGames.apply(merged.savedGames.upserts, merged.savedGames.deletes);
				}
				if (merged.sessions.upserts.length || merged.sessions.deletes.length) {
					await this.deps.sessions.apply(merged.sessions.upserts, merged.sessions.deletes);
				}
			} finally {
				this.applying = false;
			}

			const finishedAt = this.now();
			const next: SyncState = {
				account,
				since: res.serverTime,
				lastPushAt: mark,
				knownSavedGameIds: knownAfter(games, this.deps.savedGames.list(), merged.savedGames.deletes),
				knownSessionIds: knownAfter(sessions, this.deps.sessions.list(), merged.sessions.deletes),
				lastSyncAt: finishedAt,
			};
			await this.deps.kv().set(SYNC_STATE_KEY, next);
			this._lastSyncAt.value = finishedAt;
			this._lastError.value = null;
			this._status.value = this.gate() ?? 'idle';
		} catch (e) {
			this._lastError.value = message(e);
			this._status.value = 'error';
		}
	}
}

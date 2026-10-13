import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal, type Signal } from '@preact/signals';
import { createSession, savedGameFromSession, type SavedGame, type Session } from '@chess/core/game';
import type { SyncRequest, SyncResponse } from '@chess/core/protocol';
import type { KvRepository, Repositories } from '@/services/db';
import { freshRepositories } from '@/state/__tests__/testDb';
import { SYNC_STATE_KEY, SyncService, type SyncState, type SyncStoreAdapter } from './SyncService';
import type { SyncDoc } from './merge';

function game(id: string, revision = 0, updatedAt = 1_000): SavedGame {
	return { ...savedGameFromSession(createSession(), { name: id, asNew: true }), id, revision, updatedAt };
}
function session(id: string, revision = 0, updatedAt = 1_000): Session {
	return { ...createSession(), id, revision, updatedAt };
}
function reply(p: Partial<SyncResponse> = {}): SyncResponse {
	return { savedGames: [], sessions: [], deletedSavedGameIds: [], deletedSessionIds: [], serverTime: '2026-01-01T00:00:00.000Z', ...p };
}

/** Map-backed kv (fake-indexeddb does not run under fake timers). */
function memoryKv(): KvRepository {
	const m = new Map<string, unknown>();
	return {
		get: async <T>(k: string) => m.get(k) as T | undefined,
		set: async <T>(k: string, v: T) => void m.set(k, v),
		remove: async (k: string) => void m.delete(k),
	};
}

/** In-memory store adapter; `applied` records apply() calls. */
class FakeStore<T extends SyncDoc> implements SyncStoreAdapter<T> {
	readonly docs: Signal<T[]>;
	readonly applied: { upserts: T[]; deletes: string[] }[] = [];
	constructor(initial: T[] = []) {
		this.docs = signal(initial);
	}
	get watch() {
		return this.docs;
	}
	list(): readonly T[] {
		return this.docs.value;
	}
	async apply(upserts: T[], deletes: string[]): Promise<void> {
		this.applied.push({ upserts, deletes });
		const ids = new Set([...upserts.map((d) => d.id), ...deletes]);
		this.docs.value = [...this.docs.value.filter((d) => !ids.has(d.id)), ...upserts];
	}
	set(next: T[]): void {
		this.docs.value = next;
	}
}

describe('SyncService', () => {
	let repos: Repositories;
	let games: FakeStore<SavedGame>;
	let sessions: FakeStore<Session>;
	let account: Signal<string | null>;
	let online: Signal<boolean>;
	let enabled: Signal<boolean>;
	let clock: number;
	let sync: ReturnType<typeof vi.fn<(req: SyncRequest) => Promise<SyncResponse>>>;
	let service: SyncService;

	const make = (overrides: { ensureToken?: () => Promise<string | null>; kv?: KvRepository } = {}) =>
		new SyncService({
			sync,
			kv: () => overrides.kv ?? repos.kv,
			savedGames: games,
			sessions,
			ensureToken: overrides.ensureToken ?? (async () => 'tok'),
			account,
			online,
			enabled,
			now: () => clock,
			intervalMs: 60_000,
			debounceMs: 3_000,
		});

	beforeEach(() => {
		repos = freshRepositories().repos;
		games = new FakeStore([game('g1', 1, 1_000)]);
		sessions = new FakeStore([session('s1', 1, 1_000)]);
		account = signal<string | null>('http://srv|u1');
		online = signal(true);
		enabled = signal(true);
		clock = 5_000;
		sync = vi.fn(async (_req: SyncRequest) => reply());
		service = make();
	});

	afterEach(() => {
		service.stop();
		vi.useRealTimers();
	});

	it('first sync pushes everything, persists state and goes idle', async () => {
		await service.syncNow();
		expect(sync).toHaveBeenCalledTimes(1);
		const req = sync.mock.calls[0]![0];
		expect(req.savedGames.map((g) => g.id)).toEqual(['g1']);
		expect(req.sessions.map((s) => s.id)).toEqual(['s1']);
		expect(req.deletedSavedGameIds).toEqual([]);
		expect(req.since).toBeUndefined();
		const state = await repos.kv.get<SyncState>(SYNC_STATE_KEY);
		expect(state).toMatchObject({ account: 'http://srv|u1', since: '2026-01-01T00:00:00.000Z', lastPushAt: 5_000, knownSavedGameIds: ['g1'], knownSessionIds: ['s1'] });
		expect(service.status.value).toBe('idle');
		expect(service.lastSyncAt.value).toBe(5_000);
	});

	it('later syncs push only changed docs, send since, and turn local deletions into tombstones', async () => {
		await service.syncNow();
		clock = 9_000;
		games.set([game('g2', 0, 8_000)]); // g1 deleted, g2 new
		sessions.set([session('s1', 1, 1_000)]); // unchanged
		await service.syncNow();
		const req = sync.mock.calls[1]![0];
		expect(req.since).toBe('2026-01-01T00:00:00.000Z');
		expect(req.savedGames.map((g) => g.id)).toEqual(['g2']);
		expect(req.sessions).toEqual([]);
		expect(req.deletedSavedGameIds).toEqual(['g1']);
		expect(req.deletedSessionIds).toEqual([]);
		// The tombstone is sent once.
		clock = 12_000;
		await service.syncNow();
		expect(sync.mock.calls[2]![0].deletedSavedGameIds).toEqual([]);
	});

	it('applies winning remote docs and tombstones, keeps newer local edits', async () => {
		await service.syncNow();
		clock = 9_000;
		sessions.set([session('s1', 2, 6_000)]); // edited locally after the last sync
		sync.mockResolvedValueOnce(
			reply({
				savedGames: [game('g1', 2, 2_000), game('g9', 0, 2_000)],
				deletedSessionIds: ['s1'],
			}),
		);
		await service.syncNow();
		expect(games.list().map((g) => [g.id, g.revision])).toEqual([
			['g1', 2],
			['g9', 0],
		]);
		expect(sessions.list().map((s) => s.id)).toEqual(['s1']);
		expect(sessions.applied).toEqual([]);
	});

	it('does not run while disabled, signed out or offline', async () => {
		enabled.value = false;
		await service.syncNow();
		expect(service.status.value).toBe('disabled');
		enabled.value = true;
		account.value = null;
		await service.syncNow();
		expect(service.status.value).toBe('disabled');
		account.value = 'http://srv|u1';
		online.value = false;
		await service.syncNow();
		expect(service.status.value).toBe('offline');
		expect(sync).not.toHaveBeenCalled();
	});

	it('reports errors and recovers on the next run', async () => {
		sync.mockRejectedValueOnce(new Error('boom'));
		await service.syncNow();
		expect(service.status.value).toBe('error');
		expect(service.lastError.value).toBe('boom');
		await service.syncNow();
		expect(service.status.value).toBe('idle');
		expect(service.lastError.value).toBeNull();
	});

	it('is disabled when no access token can be obtained', async () => {
		service = make({ ensureToken: async () => null });
		await service.syncNow();
		expect(sync).not.toHaveBeenCalled();
		expect(service.status.value).toBe('disabled');
	});

	it('another account starts from scratch (no tombstones from the previous account)', async () => {
		await service.syncNow();
		account.value = 'http://srv|u2';
		games.set([]);
		await service.syncNow();
		const req = sync.mock.calls[1]![0];
		expect(req.deletedSavedGameIds).toEqual([]);
		expect(req.since).toBeUndefined();
	});

	it('start(): syncs when the gate opens, debounces local changes, ignores its own merges', async () => {
		vi.useFakeTimers();
		service = make({ kv: memoryKv() });
		enabled.value = false;
		service.start();
		expect(service.status.value).toBe('disabled');
		enabled.value = true; // gate opens → immediate sync
		await vi.advanceTimersByTimeAsync(0);
		expect(sync).toHaveBeenCalledTimes(1);

		// A merge that changes the store must not schedule another sync.
		sync.mockResolvedValueOnce(reply({ savedGames: [game('g5', 0, 1)] }));
		await service.syncNow();
		expect(sync).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(sync).toHaveBeenCalledTimes(2);

		// A local change → one debounced sync.
		games.set([...games.list(), game('g6', 0, 9_999)]);
		games.set([...games.list(), game('g7', 0, 9_999)]);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(sync).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1_500);
		expect(sync).toHaveBeenCalledTimes(3);

		// Periodic.
		await vi.advanceTimersByTimeAsync(60_000);
		expect(sync).toHaveBeenCalledTimes(4);

		// Going offline stops scheduling; coming back syncs at once.
		online.value = false;
		expect(service.status.value).toBe('offline');
		online.value = true;
		await vi.advanceTimersByTimeAsync(0);
		expect(sync).toHaveBeenCalledTimes(5);
	});

	it('concurrent syncNow calls share the running pass and queue one more', async () => {
		let release!: () => void;
		sync.mockImplementationOnce(() => new Promise<SyncResponse>((r) => (release = () => r(reply()))));
		const a = service.syncNow();
		await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
		const b = service.syncNow();
		const c = service.syncNow();
		expect(b).toBe(a);
		expect(c).toBe(a);
		release();
		await a;
		expect(sync).toHaveBeenCalledTimes(2);
	});
});

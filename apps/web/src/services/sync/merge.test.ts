import { describe, expect, it } from 'vitest';
import { createSession, savedGameFromSession, type SavedGame, type Session } from '@chess/core/game';
import type { SyncResponse } from '@chess/core/protocol';
import { lwwWinner, mergeKind, mergeSync, type SyncDoc } from './merge';

const doc = (id: string, revision: number, updatedAt: number): SyncDoc => ({ id, revision, updatedAt });

function game(id: string, revision: number, updatedAt: number): SavedGame {
	return { ...savedGameFromSession(createSession(), { name: id, asNew: true }), id, revision, updatedAt };
}
function session(id: string, revision: number, updatedAt: number): Session {
	return { ...createSession(), id, revision, updatedAt };
}
function response(p: Partial<SyncResponse> = {}): SyncResponse {
	return { savedGames: [], sessions: [], deletedSavedGameIds: [], deletedSessionIds: [], serverTime: new Date(0).toISOString(), ...p };
}

describe('lwwWinner', () => {
	it('higher revision wins regardless of updatedAt', () => {
		const local = doc('a', 3, 500);
		const remote = doc('a', 4, 100);
		expect(lwwWinner(local, remote)).toBe(remote);
		expect(lwwWinner(remote, local)).toBe(remote);
	});

	it('equal revision → later updatedAt wins', () => {
		const local = doc('a', 2, 100);
		const remote = doc('a', 2, 200);
		expect(lwwWinner(local, remote)).toBe(remote);
		expect(lwwWinner(remote, local)).toBe(remote);
	});

	it('exact tie keeps local', () => {
		const local = doc('a', 2, 100);
		const remote = doc('a', 2, 100);
		expect(lwwWinner(local, remote)).toBe(local);
	});
});

describe('mergeKind', () => {
	it('upserts unknown and winning remote docs, ignores losing ones', () => {
		const local = [doc('a', 1, 10), doc('b', 5, 10)];
		const remote = [doc('a', 2, 5), doc('b', 4, 99), doc('c', 0, 1)];
		const m = mergeKind(local, remote, [], 0);
		expect(m.upserts.map((d) => d.id)).toEqual(['a', 'c']);
		expect(m.deletes).toEqual([]);
	});

	it('remote tombstone deletes an unchanged local doc', () => {
		const m = mergeKind([doc('a', 1, 100)], [], ['a'], 100);
		expect(m.deletes).toEqual(['a']);
	});

	it('remote tombstone never clobbers a local edit made since the last sync', () => {
		const m = mergeKind([doc('a', 2, 150)], [], ['a'], 100);
		expect(m.deletes).toEqual([]);
	});

	it('ignores tombstones for docs that are already gone', () => {
		expect(mergeKind([], [], ['zzz'], 0).deletes).toEqual([]);
	});
});

describe('mergeSync', () => {
	it('merges saved games and sessions independently', () => {
		const local = { savedGames: [game('g1', 1, 10)], sessions: [session('s1', 3, 10), session('s2', 1, 10)] };
		const res = response({
			savedGames: [game('g1', 2, 5), game('g2', 0, 1)],
			sessions: [session('s1', 2, 50)],
			deletedSessionIds: ['s2'],
		});
		const m = mergeSync(local, res, 20);
		expect(m.savedGames.upserts.map((g) => g.id)).toEqual(['g1', 'g2']);
		expect(m.savedGames.deletes).toEqual([]);
		expect(m.sessions.upserts).toEqual([]);
		expect(m.sessions.deletes).toEqual(['s2']);
	});
});

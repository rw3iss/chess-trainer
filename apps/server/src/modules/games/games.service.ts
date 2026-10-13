import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { SavedGame, Session, SyncResponse } from '@chess/core';
import type { SyncRequestDto } from './dto/games.dto';
import { SavedGameEntity } from './entities/saved-game.entity';
import { SessionEntity } from './entities/session.entity';
import { assertSyncedDoc, SyncedDocStore } from './synced-docs.service';
import type { SyncedRow } from './entities/synced-row';

/** Saved games + sessions per user, and the batch sync endpoint. */
@Injectable()
export class GamesService {
	readonly games: SyncedDocStore<SavedGame>;
	readonly sessions: SyncedDocStore<Session>;

	constructor(
		@InjectRepository(SavedGameEntity) gamesRepo: Repository<SavedGameEntity>,
		@InjectRepository(SessionEntity) sessionsRepo: Repository<SessionEntity>,
	) {
		this.games = new SyncedDocStore<SavedGame>(gamesRepo as Repository<SyncedRow<SavedGame>>, 'saved game');
		this.sessions = new SyncedDocStore<Session>(sessionsRepo as Repository<SyncedRow<Session>>, 'session');
	}

	/**
	 * Batch sync (LWW by revision, then updatedAt):
	 * 1. apply client deletes and uploads;
	 * 2. return every server row changed since `since` (plus server copies that beat an upload),
	 *    except docs the client just uploaded and won with.
	 * `serverTime` is taken *before* writing, and the delta query is inclusive, so a concurrent
	 * write from another device can never fall between two syncs (worst case: one duplicate).
	 */
	async sync(userId: string, req: SyncRequestDto): Promise<SyncResponse> {
		req.savedGames.forEach((g, i) => assertSyncedDoc(g, `savedGames[${i}]`));
		req.sessions.forEach((s, i) => assertSyncedDoc(s, `sessions[${i}]`));
		const serverTime = Date.now();
		const sinceMs = req.since ? Date.parse(req.since) : 0;

		// Per-row writes (each upsert is atomic). Not wrapped in one transaction:
		// LWW makes a partially-applied batch safe to retry.
		const acceptedGames = new Set<string>();
		const acceptedSessions = new Set<string>();
		const winnersGames = new Map<string, SavedGame>();
		const winnersSessions = new Map<string, Session>();
		// oxlint-disable-next-line no-await-in-loop -- sequential writes keep SQLite happy and order deterministic
		for (const id of req.deletedSavedGameIds) await this.games.remove(userId, id, serverTime);
		// oxlint-disable-next-line no-await-in-loop -- sequential writes keep SQLite happy and order deterministic
		for (const id of req.deletedSessionIds) await this.sessions.remove(userId, id, serverTime);
		for (const g of req.savedGames as unknown as SavedGame[]) {
			// oxlint-disable-next-line no-await-in-loop -- sequential writes keep SQLite happy and order deterministic
			const r = await this.games.put(userId, g, serverTime);
			if (r.accepted) acceptedGames.add(g.id);
			else if (r.current) winnersGames.set(g.id, r.current);
		}
		for (const s of req.sessions as unknown as Session[]) {
			// oxlint-disable-next-line no-await-in-loop -- sequential writes keep SQLite happy and order deterministic
			const r = await this.sessions.put(userId, s, serverTime);
			if (r.accepted) acceptedSessions.add(s.id);
			else if (r.current) winnersSessions.set(s.id, r.current);
		}

		const [gameRows, sessionRows] = await Promise.all([
			this.games.changedSince(userId, sinceMs),
			this.sessions.changedSince(userId, sinceMs),
		]);
		// Server copies that beat an upload are always returned, even if older than `since`.
		for (const r of gameRows) if (!r.deleted && r.data && !acceptedGames.has(r.id)) winnersGames.set(r.id, r.data);
		for (const r of sessionRows) if (!r.deleted && r.data && !acceptedSessions.has(r.id)) winnersSessions.set(r.id, r.data);
		const clientDeletedGames = new Set(req.deletedSavedGameIds);
		const clientDeletedSessions = new Set(req.deletedSessionIds);
		return {
			savedGames: [...winnersGames.values()],
			sessions: [...winnersSessions.values()],
			deletedSavedGameIds: gameRows.filter((r) => r.deleted && !clientDeletedGames.has(r.id)).map((r) => r.id),
			deletedSessionIds: sessionRows.filter((r) => r.deleted && !clientDeletedSessions.has(r.id)).map((r) => r.id),
			serverTime: new Date(serverTime).toISOString(),
		};
	}
}

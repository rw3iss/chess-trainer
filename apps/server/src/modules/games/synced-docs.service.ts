import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import type { Page } from './dto/games.dto';
import type { SyncedRow } from './entities/synced-row';

/** Minimum fields every synced document (SavedGame, Session) must carry. */
export interface SyncedDoc {
	id: string;
	revision: number;
	updatedAt: number;
}

/**
 * True when `incoming` should replace `current` (last-writer-wins):
 * higher revision wins; equal revision → later client `updatedAt` wins.
 * Exact ties keep the server copy (idempotent re-sends are no-ops).
 */
export function incomingWins(incoming: SyncedDoc, current: { revision: number; updatedAt: number }): boolean {
	if (incoming.revision !== current.revision) return incoming.revision > current.revision;
	return incoming.updatedAt > current.updatedAt;
}

/** Validates the server-relevant fields of a client document; the rest is stored verbatim. */
export function assertSyncedDoc(x: unknown, label: string): asserts x is SyncedDoc & { tree: object } {
	const d = x as Record<string, unknown> | null;
	const ok =
		!!d &&
		typeof d === 'object' &&
		typeof d.id === 'string' &&
		d.id.length > 0 &&
		d.id.length <= 64 &&
		Number.isInteger(d.revision) &&
		typeof d.updatedAt === 'number' &&
		Number.isFinite(d.updatedAt) &&
		!!d.tree &&
		typeof d.tree === 'object';
	if (!ok) throw new BadRequestException(`${label}: needs id (≤64 chars), integer revision, numeric updatedAt and a tree object`);
}

export interface ApplyResult<T> {
	/** True when the incoming doc was stored. */
	accepted: boolean;
	/** What the server holds after the operation (null = tombstone). */
	current: T | null;
}

/**
 * Generic per-user document store with LWW + tombstones. One instance per
 * table (saved games, sessions) — see GamesService.
 */
export class SyncedDocStore<T extends SyncedDoc> {
	constructor(
		private readonly repo: Repository<SyncedRow<T>>,
		private readonly label: string,
	) {}

	/** Keyset-paginated list of live docs, most recently changed first. */
	async list(userId: string, limit = 50, cursor?: string): Promise<Page<T>> {
		const qb = this.repo
			.createQueryBuilder('r')
			.where('r.userId = :userId', { userId })
			.andWhere('r.deleted = :deleted', { deleted: false })
			.orderBy('r.serverUpdatedAt', 'DESC')
			.addOrderBy('r.id', 'DESC')
			.take(limit + 1);
		if (cursor) {
			const [t, id] = decodeCursor(cursor);
			qb.andWhere('(r.serverUpdatedAt < :t OR (r.serverUpdatedAt = :t AND r.id < :id))', { t, id });
		}
		const rows = await qb.getMany();
		const page = rows.slice(0, limit);
		const last = page[page.length - 1];
		return {
			items: page.map((r) => r.data as T),
			nextCursor: rows.length > limit && last ? encodeCursor(last.serverUpdatedAt, last.id) : null,
		};
	}

	async get(userId: string, id: string): Promise<T> {
		const row = await this.repo.findOne({ where: { userId, id } as never });
		if (!row || row.deleted || !row.data) throw new NotFoundException(`${this.label} not found`);
		return row.data;
	}

	/** Stores `doc` if it wins LWW against the server copy (or none exists). */
	async put(userId: string, doc: T, now = Date.now()): Promise<ApplyResult<T>> {
		const row = await this.repo.findOne({ where: { userId, id: doc.id } as never });
		if (row && !incomingWins(doc, row)) return { accepted: false, current: row.deleted ? null : row.data };
		await this.repo.save(
			this.repo.create({
				userId,
				id: doc.id,
				data: doc,
				revision: doc.revision,
				updatedAt: doc.updatedAt,
				deleted: false,
				serverUpdatedAt: now,
			} as never),
		);
		return { accepted: true, current: doc };
	}

	/** Tombstones a doc. Unknown ids are recorded too so late uploads from other devices stay deleted. */
	async remove(userId: string, id: string, now = Date.now()): Promise<void> {
		const row = await this.repo.findOne({ where: { userId, id } as never });
		await this.repo.save(
			this.repo.create({
				userId,
				id,
				data: null,
				revision: row?.revision ?? 0,
				updatedAt: now,
				deleted: true,
				serverUpdatedAt: now,
			} as never),
		);
	}

	/** Rows changed at or after `sinceMs` (server clock). */
	changedSince(userId: string, sinceMs: number): Promise<SyncedRow<T>[]> {
		return this.repo
			.createQueryBuilder('r')
			.where('r.userId = :userId', { userId })
			.andWhere('r.serverUpdatedAt >= :since', { since: sinceMs })
			.getMany();
	}
}

function encodeCursor(t: number, id: string): string {
	return Buffer.from(JSON.stringify([t, id])).toString('base64url');
}

function decodeCursor(cursor: string): [number, string] {
	try {
		const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
		if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'string') return [v[0], v[1]];
	} catch {
		/* fall through */
	}
	throw new BadRequestException('invalid cursor');
}

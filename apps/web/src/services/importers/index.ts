// Online game import (Lichess, Chess.com) into saved games. The site generators stream games newest first;
// runImport parses each PGN (PGN worker), skips games already imported (deterministic ids), and saves in
// batches. State and UI stay outside: the caller injects parse / hasId / save.
//
//   const r = await runImport('lichess', { username, max: 100, signal }, { parse: parsePgn, hasId, save, onProgress });
import type { SavedGame } from '@chess/core/game';
import { savedGameFromImport, type ImportedGame } from '@/services/pgn';
import { chesscomGames } from './chesscom';
import { lichessGameCount, lichessGames } from './lichess';
import type { ImportSite, RemoteGame, RemoteImportOptions } from './types';

export * from './types';
export { lichessGames, lichessGameCount, lichessGamesUrl, ndjsonLines } from './lichess';
export { chesscomGames, chesscomGameId, filterArchives } from './chesscom';

export const SITE_LABEL: Record<ImportSite, string> = { lichess: 'Lichess', chesscom: 'Chess.com' };
/** Tag added to every game imported from the site. */
export const SITE_TAG: Record<ImportSite, string> = { lichess: 'lichess', chesscom: 'chesscom' };

/** Saved-game id for a site game: the same game always maps to the same id (dedupe, sync-safe). */
export function importedGameId(site: ImportSite, id: string): string {
	return `${site}-${id}`.slice(0, 64);
}

export function remoteGames(site: ImportSite, o: RemoteImportOptions): AsyncGenerator<RemoteGame> {
	return site === 'lichess' ? lichessGames(o) : chesscomGames(o);
}

/** How many games the import will see, when the site says (Lichess); undefined = unknown. */
export async function estimateTotal(site: ImportSite, o: RemoteImportOptions): Promise<number | undefined> {
	if (site !== 'lichess' || o.from || o.to) return o.max;
	const n = await lichessGameCount(o).catch(() => undefined);
	return n === undefined ? o.max : o.max ? Math.min(o.max, n) : n;
}

const UNKNOWN = new Set(['', '?', '-']);

/** "White vs Black, 2026-11-02" from PGN headers. */
export function importedGameName(h: Record<string, string>, fallback: string): string {
	const white = UNKNOWN.has(h.White?.trim() ?? '') ? '?' : h.White!.trim();
	const black = UNKNOWN.has(h.Black?.trim() ?? '') ? '?' : h.Black!.trim();
	const rawDate = h.UTCDate ?? h.Date ?? '';
	const date = /^\d{4}\.\d{2}\.\d{2}$/.test(rawDate) ? rawDate.replace(/\./g, '-') : '';
	if (white === '?' && black === '?') return fallback;
	return `${white} vs ${black}${date ? `, ${date}` : ''}`;
}

/** SavedGame for a parsed site game. */
export function savedGameFromRemote(site: ImportSite, username: string, remote: RemoteGame, imp: ImportedGame, now: number): SavedGame {
	const at = remote.playedAt ?? now;
	const game = savedGameFromImport(imp, at);
	const tags = new Set([...game.tags, SITE_TAG[site], username.toLowerCase()]);
	return { ...game, id: importedGameId(site, remote.id), name: importedGameName(imp.headers, `${SITE_LABEL[site]} game ${remote.id}`), tags: [...tags] };
}

export interface ImportProgress {
	/** Games read from the site so far. */
	fetched: number;
	imported: number;
	/** Already in saved games (or repeated). */
	skipped: number;
	/** Expected total, when known. */
	total?: number;
}

export interface ImportDeps {
	parse: (pgn: string) => Promise<ImportedGame[]>;
	hasId: (id: string) => boolean;
	save: (games: SavedGame[]) => Promise<number>;
	onProgress?: (p: ImportProgress) => void;
	/** Games saved per batch. */
	batchSize?: number;
	now?: () => number;
	/** Injected for tests (default: remoteGames). */
	source?: (site: ImportSite, o: RemoteImportOptions) => AsyncIterable<RemoteGame>;
}

/**
 * Streams, parses, dedupes and saves. Saved batches stay saved when cancelled (AbortError is rethrown
 * after the last full batch is written). Games that fail to parse are skipped and counted as skipped.
 */
export async function runImport(site: ImportSite, o: RemoteImportOptions, deps: ImportDeps): Promise<ImportProgress> {
	const p: ImportProgress = { fetched: 0, imported: 0, skipped: 0, total: undefined };
	const batchSize = deps.batchSize ?? 25;
	const now = deps.now ?? Date.now;
	const seen = new Set<string>();
	let batch: RemoteGame[] = [];
	const flush = async () => {
		if (!batch.length) return;
		const games = batch;
		batch = [];
		const parsed = await Promise.all(games.map((g) => deps.parse(g.pgn).then((list) => list[0]).catch(() => undefined)));
		const saved: SavedGame[] = [];
		parsed.forEach((imp, i) => {
			if (imp) saved.push(savedGameFromRemote(site, o.username, games[i]!, imp, now()));
			else p.skipped++;
		});
		p.imported += await deps.save(saved);
		deps.onProgress?.({ ...p });
	};
	try {
		for await (const g of (deps.source ?? remoteGames)(site, o)) {
			p.fetched++;
			const id = importedGameId(site, g.id);
			if (seen.has(id) || deps.hasId(id)) p.skipped++;
			else {
				seen.add(id);
				batch.push(g);
			}
			if (batch.length >= batchSize) await flush();
			else if (p.fetched % 10 === 0) deps.onProgress?.({ ...p });
		}
		await flush();
	} catch (e) {
		await flush().catch(() => undefined);
		throw e;
	}
	deps.onProgress?.({ ...p });
	return p;
}

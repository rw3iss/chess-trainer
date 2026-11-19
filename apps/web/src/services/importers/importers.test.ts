import { describe, expect, it, vi } from 'vitest';
import { parsePgnImports } from '@/services/pgn';
import {
	chesscomGameId,
	chesscomGames,
	filterArchives,
	importedGameId,
	importedGameName,
	ImportError,
	lichessGames,
	lichessGamesUrl,
	ndjsonLines,
	runImport,
	type RemoteGame,
} from './index';

const pgn = (white: string, black: string, date = '2026.11.02', moves = '1. e4 e5 2. Nf3 Nc6 *') => `[Event "Rated Blitz game"]\n[White "${white}"]\n[Black "${black}"]\n[UTCDate "${date}"]\n[Result "*"]\n\n${moves}\n`;

/** A Response whose body arrives in the given chunks (tests the NDJSON splitter across chunk borders). */
function streamed(chunks: string[], init: ResponseInit = { status: 200 }): Response {
	const enc = new TextEncoder();
	const body = new ReadableStream<Uint8Array>({
		start(c) {
			for (const ch of chunks) c.enqueue(enc.encode(ch));
			c.close();
		},
	});
	return new Response(body, init);
}

const json = (v: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(v), { status, headers });
const collect = async <T>(it: AsyncIterable<T>) => {
	const out: T[] = [];
	for await (const x of it) out.push(x);
	return out;
};

describe('lichess', () => {
	it('builds the export URL from the options', () => {
		const u = new URL(lichessGamesUrl({ username: 'Drnyk', max: 20, ratedOnly: true, from: '2026-01', to: '2026-02' }));
		expect(u.pathname).toBe('/api/games/user/Drnyk');
		expect(u.searchParams.get('max')).toBe('20');
		expect(u.searchParams.get('rated')).toBe('true');
		expect(u.searchParams.get('pgnInJson')).toBe('true');
		expect(Number(u.searchParams.get('since'))).toBe(Date.UTC(2026, 0, 1));
		expect(Number(u.searchParams.get('until'))).toBe(Date.UTC(2026, 2, 1) - 1);
	});

	it('splits NDJSON across chunk borders', async () => {
		const res = streamed(['{"a":1}\n{"b"', ':2}\n\n{"c":3}']);
		expect(await collect(ndjsonLines(res.body!))).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
	});

	it('streams games, skips variants, retries after 429', async () => {
		const lines = [
			{ id: 'aaa', pgn: pgn('A', 'B'), lastMoveAt: 2000, variant: 'standard' },
			{ id: 'bbb', pgn: pgn('C', 'D'), variant: 'chess960' },
			{ id: 'ccc', pgn: pgn('E', 'F'), createdAt: 1000 },
		].map((l) => JSON.stringify(l) + '\n');
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response('', { status: 429 }))
			.mockResolvedValueOnce(streamed(lines));
		const sleep = vi.fn().mockResolvedValue(undefined);
		const onWait = vi.fn();
		const games = await collect(lichessGames({ username: 'x', fetch, sleep, onWait }));
		expect(games.map((g) => g.id)).toEqual(['aaa', 'ccc']);
		expect(games[0]).toMatchObject({ site: 'lichess', playedAt: 2000, url: 'https://lichess.org/aaa' });
		expect(onWait).toHaveBeenCalledWith(61_000);
		expect(sleep).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0]![1].headers.Accept).toBe('application/x-ndjson');
	});

	it('maps 404 to a readable error and honors abort', async () => {
		await expect(collect(lichessGames({ username: 'nobody', fetch: vi.fn().mockResolvedValue(new Response('', { status: 404 })) }))).rejects.toThrow(ImportError);
		const ctrl = new AbortController();
		ctrl.abort();
		await expect(collect(lichessGames({ username: 'x', fetch: vi.fn(), signal: ctrl.signal }))).rejects.toMatchObject({ name: 'AbortError' });
	});
});

describe('chess.com', () => {
	const base = 'https://api.chess.com/pub/player/bob/games';
	it('filters archive months and reads game ids', () => {
		const urls = [`${base}/2025/12`, `${base}/2026/01`, `${base}/2026/02`];
		expect(filterArchives(urls, '2026-01')).toEqual(urls.slice(1));
		expect(filterArchives(urls, undefined, '2025-12')).toEqual(urls.slice(0, 1));
		expect(chesscomGameId({ url: 'https://www.chess.com/game/live/123456' })).toBe('123456');
		expect(chesscomGameId({ uuid: 'u-1' })).toBe('u-1');
	});

	it('reads months newest first, newest game first, stops at max, skips variants and unrated', async () => {
		const month = (games: unknown[]) => json({ games });
		const fetch = vi.fn(async (url: string) => {
			if (url.endsWith('/games/archives')) return json({ archives: [`${base}/2026/01`, `${base}/2026/02`] });
			if (url.endsWith('/2026/02'))
				return month([
					{ url: 'https://www.chess.com/game/live/1', pgn: pgn('A', 'B'), end_time: 100, rated: true, rules: 'chess' },
					{ url: 'https://www.chess.com/game/live/2', pgn: pgn('C', 'D'), end_time: 200, rated: false, rules: 'chess' },
					{ url: 'https://www.chess.com/game/daily/3', pgn: pgn('E', 'F'), end_time: 300, rated: true, rules: 'chess960' },
				]);
			if (url.endsWith('/2026/01')) return month([{ url: 'https://www.chess.com/game/live/4', pgn: pgn('G', 'H'), end_time: 50, rated: true, rules: 'chess' }]);
			return new Response('', { status: 404 });
		});
		const all = await collect(chesscomGames({ username: 'Bob', fetch: fetch as unknown as typeof globalThis.fetch }));
		expect(all.map((g) => g.id)).toEqual(['2', '1', '4']);
		expect(all[0]!.playedAt).toBe(200_000);
		const rated = await collect(chesscomGames({ username: 'bob', ratedOnly: true, max: 1, fetch: fetch as unknown as typeof globalThis.fetch }));
		expect(rated.map((g) => g.id)).toEqual(['1']);
	});

	it('404 on archives → player not found', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
		await expect(collect(chesscomGames({ username: 'ghost', fetch }))).rejects.toThrow(/No Chess.com player named “ghost”/);
	});
});

describe('runImport', () => {
	const remote = (id: string, w = 'W', b = 'B'): RemoteGame => ({ site: 'lichess', id, pgn: pgn(w, b), playedAt: 1_700_000_000_000 });
	const deps = (have: string[] = []) => {
		const saved: string[] = [];
		return {
			saved,
			parse: async (text: string) => parsePgnImports(text),
			hasId: (id: string) => have.includes(id),
			save: vi.fn(async (games: { id: string }[]) => {
				saved.push(...games.map((g) => g.id));
				return games.length;
			}),
		};
	};

	it('names, tags, dedupes and saves in batches', async () => {
		const d = deps([importedGameId('lichess', 'b')]);
		const source = async function* () {
			yield remote('a', 'Alice', 'Bob');
			yield remote('b');
			yield remote('a');
			yield remote('c');
		};
		const save = d.save;
		const res = await runImport('lichess', { username: 'Alice' }, { ...d, batchSize: 1, source });
		expect(res).toMatchObject({ fetched: 4, imported: 2, skipped: 2 });
		expect(d.saved).toEqual(['lichess-a', 'lichess-c']);
		const first = save.mock.calls[0]![0][0] as unknown as { name: string; tags: string[]; updatedAt: number };
		expect(first.name).toBe('Alice vs Bob, 2026-11-02');
		expect(first.tags).toEqual(['lichess', 'alice']);
		expect(first.updatedAt).toBe(1_700_000_000_000);
	});

	it('keeps saved batches when cancelled', async () => {
		const d = deps();
		const ctrl = new AbortController();
		const source = async function* () {
			yield remote('a');
			yield remote('b');
			ctrl.abort();
			throw new DOMException('Import cancelled', 'AbortError');
		};
		await expect(runImport('lichess', { username: 'x', signal: ctrl.signal }, { ...d, batchSize: 10, source })).rejects.toMatchObject({ name: 'AbortError' });
		expect(d.saved).toEqual(['lichess-a', 'lichess-b']);
	});

	it('importedGameName falls back without players', () => {
		expect(importedGameName({ White: '?', Black: '?' }, 'Lichess game x')).toBe('Lichess game x');
		expect(importedGameName({ White: 'A', Black: 'B', Date: '2024.01.05' }, 'f')).toBe('A vs B, 2024-01-05');
	});
});

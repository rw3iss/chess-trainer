import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { MemoryCacheService } from '../../src/cache/cache.service';
import { ExplorerService, explorerKey, mapExplorer } from '../../src/modules/openings/explorer.service';
import { LichessQueue, RateLimitedError } from '../../src/modules/openings/lichess-queue';

const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

const lichessPayload = {
	white: 100,
	draws: 50,
	black: 80,
	moves: [
		{ uci: 'f1b5', san: 'Bb5', white: 60, draws: 30, black: 40, averageRating: 2100, game: null },
		{ uci: 'e1h1', san: 'O-O', white: 5, draws: 1, black: 2, averageRating: 1900 },
	],
	topGames: [],
	opening: { eco: 'C44', name: "King's Knight Opening: Normal Variation" },
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function makeService(token: string | undefined): { svc: ExplorerService; cache: MemoryCacheService } {
	const values: Record<string, unknown> = {
		'openings.lichessToken': token,
		'openings.explorerBaseUrl': 'https://explorer.test',
		'openings.explorerMinIntervalMs': 0,
		'openings.explorerCacheTtl': 3600,
	};
	const config = { get: (k: string) => values[k] } as unknown as ConfigService;
	const cache = new MemoryCacheService();
	return { svc: new ExplorerService(config, cache), cache };
}

describe('explorer mapping', () => {
	it('maps Lichess payloads to ExplorerResult and fixes castling uci', () => {
		const r = mapExplorer(FEN, 'lichess', lichessPayload, new Date('2026-01-01T00:00:00Z'));
		expect(r).toEqual({
			fen: FEN,
			source: 'lichess',
			white: 100,
			draws: 50,
			black: 80,
			moves: [
				{ uci: 'f1b5', san: 'Bb5', white: 60, draws: 30, black: 40, averageRating: 2100 },
				{ uci: 'e1g1', san: 'O-O', white: 5, draws: 1, black: 2, averageRating: 1900 },
			],
			opening: { eco: 'C44', name: "King's Knight Opening: Normal Variation" },
			cachedAt: '2026-01-01T00:00:00.000Z',
		});
	});

	it('omits opening when null and keys the cache by EPD', () => {
		const r = mapExplorer(FEN, 'masters', { white: 0, draws: 0, black: 0, moves: [], opening: null });
		expect(r.opening).toBeUndefined();
		expect(explorerKey('masters', FEN)).toBe('explorer:masters:r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -');
	});
});

describe('ExplorerService', () => {
	afterEach(() => jest.restoreAllMocks());

	it('calls Lichess with the bearer token, caches, and de-duplicates concurrent lookups', async () => {
		const { svc, cache } = makeService('lip_test');
		const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => jsonResponse(lichessPayload));
		const [a, b] = await Promise.all([svc.lookup(FEN, 'lichess'), svc.lookup(FEN, 'lichess')]);
		expect(a).toEqual(b);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toMatch(/^https:\/\/explorer\.test\/lichess\?/);
		expect(new URL(String(url)).searchParams.get('fen')).toBe(FEN);
		expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer lip_test');

		await svc.lookup(FEN, 'lichess');
		expect(fetchMock).toHaveBeenCalledTimes(1); // served from cache
		expect(await cache.get(explorerKey('lichess', FEN))).toBeDefined();
		cache.onModuleDestroy();
	});

	it('uses the masters endpoint for source=masters', async () => {
		const { svc, cache } = makeService('t');
		const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ ...lichessPayload, opening: null }));
		const r = await svc.lookup(FEN, 'masters');
		expect(String(fetchMock.mock.calls[0]![0])).toContain('/masters?');
		expect(r.source).toBe('masters');
		cache.onModuleDestroy();
	});

	it('is disabled (503) without LICHESS_TOKEN and maps upstream errors to 502', async () => {
		const off = makeService(undefined);
		expect(off.svc.enabled).toBe(false);
		await expect(off.svc.lookup(FEN)).rejects.toMatchObject({ status: 503 });
		const on = makeService('t');
		jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, 500));
		await expect(on.svc.lookup(FEN)).rejects.toBeInstanceOf(HttpException);
		await expect(on.svc.lookup(FEN)).rejects.toMatchObject({ status: 502 });
		off.cache.onModuleDestroy();
		on.cache.onModuleDestroy();
	});
});

describe('LichessQueue', () => {
	it('spaces requests by minIntervalMs and backs off after 429', async () => {
		const sleeps: number[] = [];
		const q = new LichessQueue({ minIntervalMs: 1000, backoffMs: 60_000, maxRetries: 1 }, async (ms) => {
			sleeps.push(ms);
		});
		const statuses = [429, 200, 200];
		const fn = jest.fn(async () => new Response('{}', { status: statuses.shift()! }));
		const r1 = await q.run(fn);
		expect(r1.status).toBe(200);
		expect(fn).toHaveBeenCalledTimes(2);
		expect(sleeps[0]).toBeGreaterThan(59_000); // waited the backoff after 429
		await q.run(fn);
		expect(sleeps[1]).toBeGreaterThan(900); // ~1 s gap before the next request
	});

	it('gives up after maxRetries 429s', async () => {
		const q = new LichessQueue({ minIntervalMs: 0, backoffMs: 1, maxRetries: 1 }, async () => undefined);
		await expect(q.run(async () => new Response('', { status: 429 }))).rejects.toBeInstanceOf(RateLimitedError);
		// queue keeps working afterwards
		expect((await q.run(async () => new Response('', { status: 200 }))).status).toBe(200);
	});
});

import {
	BadGatewayException,
	HttpException,
	HttpStatus,
	Injectable,
	Logger,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExplorerMove, ExplorerResult, ExplorerSource } from '@chess/core';
import { CacheService } from '../../cache/cache.service';
import { LichessQueue, RateLimitedError } from './lichess-queue';

/** Raw Lichess explorer response (fields we use). */
export interface LichessExplorerResponse {
	white: number;
	draws: number;
	black: number;
	moves: { uci: string; san: string; white: number; draws: number; black: number; averageRating?: number }[];
	opening?: { eco: string; name: string } | null;
}

// Lichess reports castling as king-takes-rook; the app uses king-two-squares.
const CASTLING_FIX: Record<string, string> = { e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' };

/** Normalizes a FEN for cache keys: first 4 fields (EPD) — clocks don't change explorer stats. */
export function explorerKey(source: ExplorerSource, fen: string): string {
	return `explorer:${source}:${fen.trim().split(/\s+/).slice(0, 4).join(' ')}`;
}

/** Maps a Lichess explorer payload to the shared `ExplorerResult` DTO. */
export function mapExplorer(fen: string, source: ExplorerSource, raw: LichessExplorerResponse, now = new Date()): ExplorerResult {
	const moves: ExplorerMove[] = (raw.moves ?? []).map((m) => {
		const castle = m.san.startsWith('O-O') ? CASTLING_FIX[m.uci] : undefined;
		const move: ExplorerMove = { uci: castle ?? m.uci, san: m.san, white: m.white, draws: m.draws, black: m.black };
		if (typeof m.averageRating === 'number') move.averageRating = m.averageRating;
		return move;
	});
	const result: ExplorerResult = {
		fen,
		source,
		white: raw.white ?? 0,
		draws: raw.draws ?? 0,
		black: raw.black ?? 0,
		moves,
		cachedAt: now.toISOString(),
	};
	if (raw.opening) result.opening = { eco: raw.opening.eco, name: raw.opening.name };
	return result;
}

/**
 * Lichess opening-explorer proxy. Adds the server's LICHESS_TOKEN, serializes
 * requests through a rate-limited queue, caches results (default 7 days) and
 * collapses concurrent identical requests into one upstream call.
 */
@Injectable()
export class ExplorerService {
	private readonly logger = new Logger(ExplorerService.name);
	private readonly inflight = new Map<string, Promise<ExplorerResult>>();
	readonly queue: LichessQueue;

	constructor(
		private readonly config: ConfigService,
		private readonly cache: CacheService,
	) {
		this.queue = new LichessQueue({
			minIntervalMs: config.get<number>('openings.explorerMinIntervalMs')!,
			backoffMs: 60_000,
			maxRetries: 1,
		});
	}

	get enabled(): boolean {
		return !!this.config.get<string>('openings.lichessToken');
	}

	/** Explorer stats for a position; cache first, then Lichess. */
	async lookup(fen: string, source: ExplorerSource = 'lichess'): Promise<ExplorerResult> {
		const key = explorerKey(source, fen);
		const cached = await this.cache.get<ExplorerResult>(key);
		if (cached) return cached;
		const pending = this.inflight.get(key);
		if (pending) return pending;
		const p = this.fetchAndCache(key, fen, source).finally(() => this.inflight.delete(key));
		this.inflight.set(key, p);
		return p;
	}

	private async fetchAndCache(key: string, fen: string, source: ExplorerSource): Promise<ExplorerResult> {
		const token = this.config.get<string>('openings.lichessToken');
		if (!token) throw new ServiceUnavailableException('explorer disabled: LICHESS_TOKEN not set');
		const base = this.config.get<string>('openings.explorerBaseUrl')!;
		const params = new URLSearchParams({ fen, moves: '20', topGames: '0' });
		if (source === 'lichess') {
			params.set('variant', 'standard');
			params.set('recentGames', '0');
		}
		const url = `${base}/${source}?${params}`;

		let res: Response;
		try {
			res = await this.queue.run(() =>
				fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }),
			);
		} catch (err) {
			if (err instanceof RateLimitedError) throw new HttpException(err.message, HttpStatus.TOO_MANY_REQUESTS);
			this.logger.warn(`explorer fetch failed: ${(err as Error).message}`);
			throw new BadGatewayException('explorer unreachable');
		}
		if (!res.ok) {
			this.logger.warn(`explorer ${res.status} for ${url}`);
			throw new BadGatewayException(`explorer responded ${res.status}`);
		}
		const result = mapExplorer(fen, source, (await res.json()) as LichessExplorerResponse);
		await this.cache.set(key, result, this.config.get<number>('openings.explorerCacheTtl'));
		return result;
	}
}

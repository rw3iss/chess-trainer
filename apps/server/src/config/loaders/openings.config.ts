import { registerAs } from '@nestjs/config';
import { resolve } from 'path';

export default registerAs('openings', () => ({
	// Static dataset dir (built by tools/openings-data). Default assumes the
	// server runs from apps/server (pnpm --filter / make).
	dataDir: resolve(process.env.DATA_DIR || '../web/public/data'),
	lichessToken: process.env.LICHESS_TOKEN || undefined,
	explorerBaseUrl: process.env.EXPLORER_BASE_URL || 'https://explorer.lichess.org',
	explorerMinIntervalMs: parseInt(process.env.EXPLORER_MIN_INTERVAL_MS ?? '1000', 10),
	explorerCacheTtl: parseInt(process.env.EXPLORER_CACHE_TTL ?? String(7 * 24 * 3600), 10),
	explorerPublic: process.env.EXPLORER_PUBLIC === 'true',
}));

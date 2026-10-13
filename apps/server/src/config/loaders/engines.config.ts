import { registerAs } from '@nestjs/config';

export default registerAs('engines', () => ({
	stockfishPath: process.env.ENGINE_STOCKFISH_PATH || undefined,
	lc0Path: process.env.ENGINE_LC0_PATH || undefined,
	lc0Weights: process.env.LC0_WEIGHTS || undefined,
	maiaWeightsDir: process.env.MAIA_WEIGHTS_DIR || undefined,
	komodoPath: process.env.ENGINE_KOMODO_PATH || undefined,
	fairyPath: process.env.ENGINE_FAIRY_PATH || undefined,
	maxProcesses: parseInt(process.env.ENGINE_MAX_PROCESSES ?? '4', 10),
	maxPerSocket: parseInt(process.env.ENGINE_MAX_PER_SOCKET ?? '2', 10),
	idleTimeoutMs: parseInt(process.env.ENGINE_IDLE_TIMEOUT_MS ?? String(5 * 60 * 1000), 10),
	threads: parseInt(process.env.ENGINE_THREADS ?? '1', 10),
	hashMb: parseInt(process.env.ENGINE_HASH_MB ?? '64', 10),
	allowGuests: process.env.ENGINE_ALLOW_GUESTS === 'true',
}));

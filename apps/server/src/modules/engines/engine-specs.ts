import { accessSync, constants, readdirSync } from 'fs';
import { join } from 'path';
import { ENGINE_CATALOG, type EngineMeta } from '@chess/core';

/** Engine settings from the `engines` config namespace. */
export interface EnginesConfig {
	stockfishPath?: string;
	lc0Path?: string;
	lc0Weights?: string;
	maiaWeightsDir?: string;
	komodoPath?: string;
	fairyPath?: string;
	maxProcesses: number;
	maxPerSocket: number;
	idleTimeoutMs: number;
	threads: number;
	hashMb: number;
	allowGuests: boolean;
}

/** How to launch one remote engine, or why it can't be launched. */
export interface EngineSpec {
	meta: EngineMeta;
	path?: string;
	args: string[];
	/** Options sent once after the handshake (Threads, Hash, …). */
	initOptions: Record<string, string | number | boolean>;
	/** Maia: rating bucket → weights file. */
	maiaWeights?: Map<number, string>;
	available: boolean;
	reason?: string;
}

/** Server-side Fairy-Stockfish entry (the core catalog only lists the local WASM build). */
function fairyRemoteMeta(): EngineMeta | undefined {
	const local = ENGINE_CATALOG.find((e) => e.id === 'fairy');
	if (!local) return undefined;
	const { sizeMb: _s, requiresDownload: _r, ...rest } = local;
	return { ...rest, id: 'fairy-native', name: `${local.name} (server)`, kind: 'remote', description: `${local.description} Runs natively on the server.` };
}

function checkExecutable(path: string | undefined, envName: string): string | undefined {
	if (!path) return `${envName} not set`;
	try {
		accessSync(path, constants.X_OK);
		return undefined;
	} catch {
		return `binary not found or not executable at ${path}`;
	}
}

/** Maia weights: files named like maia-1500.pb.gz (any extension) in MAIA_WEIGHTS_DIR. */
export function findMaiaWeights(dir: string | undefined): Map<number, string> {
	const out = new Map<number, string>();
	if (!dir) return out;
	try {
		for (const f of readdirSync(dir)) {
			const m = /^maia-(\d{3,4})\b/.exec(f);
			if (m) out.set(Number(m[1]), join(dir, f));
		}
	} catch {
		/* missing dir → no weights */
	}
	return out;
}

/**
 * Resolves every remote catalog engine to a launch spec using env paths.
 * File checks only — the UCI handshake probe happens in EnginesService.
 */
export function resolveEngineSpecs(cfg: EnginesConfig): EngineSpec[] {
	const tuning = { Threads: cfg.threads, Hash: cfg.hashMb };
	const metas = ENGINE_CATALOG.filter((e) => e.kind === 'remote');
	const fairy = fairyRemoteMeta();
	if (fairy && cfg.fairyPath) metas.push(fairy);

	return metas.map((meta): EngineSpec => {
		switch (meta.id) {
			case 'sf-native': {
				const reason = checkExecutable(cfg.stockfishPath, 'ENGINE_STOCKFISH_PATH');
				return { meta, path: cfg.stockfishPath, args: [], initOptions: tuning, available: !reason, reason };
			}
			case 'komodo': {
				const reason = checkExecutable(cfg.komodoPath, 'ENGINE_KOMODO_PATH');
				return { meta, path: cfg.komodoPath, args: [], initOptions: tuning, available: !reason, reason };
			}
			case 'fairy-native': {
				const reason = checkExecutable(cfg.fairyPath, 'ENGINE_FAIRY_PATH');
				return { meta, path: cfg.fairyPath, args: [], initOptions: tuning, available: !reason, reason };
			}
			case 'lc0': {
				const reason = checkExecutable(cfg.lc0Path, 'ENGINE_LC0_PATH');
				const args = cfg.lc0Weights ? [`--weights=${cfg.lc0Weights}`] : [];
				return { meta, path: cfg.lc0Path, args, initOptions: { Threads: cfg.threads }, available: !reason, reason };
			}
			case 'maia-remote': {
				let reason = checkExecutable(cfg.lc0Path, 'ENGINE_LC0_PATH (Maia runs on lc0)');
				const weights = findMaiaWeights(cfg.maiaWeightsDir);
				if (!reason && weights.size === 0) {
					reason = cfg.maiaWeightsDir ? `no maia-<rating>.pb.gz files in ${cfg.maiaWeightsDir}` : 'MAIA_WEIGHTS_DIR not set';
				}
				// Start on any model; the bucket's WeightsFile is set before each search.
				const first = [...weights.values()][0];
				const args = first ? [`--weights=${first}`] : [];
				return { meta, path: cfg.lc0Path, args, initOptions: { Threads: 1 }, maiaWeights: weights, available: !reason, reason };
			}
			default:
				return { meta, args: [], initOptions: {}, available: false, reason: 'no server launcher for this engine' };
		}
	});
}

/**
 * Strength strategy (PLAN §5.3): maps (engine, target Elo, think setting) to UCI
 * options, `go` limits and a blunder-blend probability.
 */
import type { ThinkPreset, ThinkSetting } from '../game/types.js';
import type { EngineMeta, StrengthPlan } from './types.js';

export const THINK_PRESET_MS: Record<ThinkPreset, number> = {
	instant: 50,
	fast: 300,
	normal: 1000,
	deep: 3000,
};

/** Minimum wall time before a bot move is shown. */
export const MIN_HUMAN_DELAY_MS = 400;

export const STOCKFISH_ELO_MIN = 1320;
export const STOCKFISH_ELO_MAX = 3190;
/** Lowest Elo the blunder blend targets. */
export const BLEND_FLOOR_ELO = 400;
/** Blunder chance at BLEND_FLOOR_ELO. */
export const MAX_BLUNDER_CHANCE = 0.5;
/** lc0 Elo at nodes=1 (approximate, BT nets). */
export const LC0_ONE_NODE_ELO = 2200;
export const MAIA_BUCKETS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];
export const MAIA_TEMPERATURE = 0.1;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function thinkMs(think: ThinkSetting): number {
	return 'movetimeMs' in think ? Math.max(1, think.movetimeMs) : THINK_PRESET_MS[think.preset];
}

export function nearestMaiaBucket(elo: number): number {
	const b = Math.round(elo / 100) * 100;
	return clamp(b, MAIA_BUCKETS[0]!, MAIA_BUCKETS[MAIA_BUCKETS.length - 1]!);
}

/** 0 at/above `floorElo`, rising linearly to MAX_BLUNDER_CHANCE at BLEND_FLOOR_ELO. */
export function blendChance(elo: number, floorElo: number): number {
	if (elo >= floorElo) return 0;
	const t = (floorElo - clamp(elo, BLEND_FLOOR_ELO, floorElo)) / (floorElo - BLEND_FLOOR_ELO);
	return Math.round(MAX_BLUNDER_CHANCE * t * 1000) / 1000;
}

function stockfishPlan(elo: number | undefined, movetimeMs: number): Omit<StrengthPlan, 'minDelayMs'> {
	if (elo === undefined || elo >= STOCKFISH_ELO_MAX) {
		return { options: { UCI_LimitStrength: false, 'Skill Level': 20 }, go: { movetimeMs }, blunderChance: 0 };
	}
	if (elo >= STOCKFISH_ELO_MIN) {
		return {
			options: { UCI_LimitStrength: true, UCI_Elo: Math.round(elo) },
			go: { movetimeMs },
			blunderChance: 0,
		};
	}
	// Below the UCI_Elo floor: Skill 0 + shallow search + random-move blend.
	const t = (clamp(elo, BLEND_FLOOR_ELO, STOCKFISH_ELO_MIN) - BLEND_FLOOR_ELO) / (STOCKFISH_ELO_MIN - BLEND_FLOOR_ELO);
	return {
		options: { UCI_LimitStrength: false, 'Skill Level': 0 },
		go: {
			movetimeMs: Math.min(movetimeMs, 200),
			depth: Math.round(lerp(1, 5, t)),
			nodes: Math.round(lerp(50, 5000, t * t)),
		},
		blunderChance: blendChance(elo, STOCKFISH_ELO_MIN),
	};
}

function fairyPlan(meta: EngineMeta, elo: number | undefined, movetimeMs: number): Omit<StrengthPlan, 'minDelayMs'> {
	if (elo === undefined) return { options: { 'Skill Level': 20 }, go: { movetimeMs }, blunderChance: 0 };
	const [lo, hi] = meta.eloRange;
	const t = (clamp(elo, lo, hi) - lo) / (hi - lo);
	const skill = Math.round(lerp(0, 20, t));
	const go: StrengthPlan['go'] = { movetimeMs };
	if (skill < 10) go.depth = Math.round(lerp(1, 8, t * 2));
	return { options: { 'Skill Level': skill }, go, blunderChance: blendChance(elo, lo) };
}

function komodoPlan(meta: EngineMeta, elo: number | undefined, movetimeMs: number): Omit<StrengthPlan, 'minDelayMs'> {
	if (elo === undefined || elo >= meta.eloRange[1]) {
		return { options: { 'UCI LimitStrength': false }, go: { movetimeMs }, blunderChance: 0 };
	}
	const lo = meta.eloRange[0];
	return {
		options: { 'UCI LimitStrength': true, 'UCI Elo': Math.round(Math.max(elo, lo)) },
		go: { movetimeMs },
		blunderChance: blendChance(elo, lo),
	};
}

/** lc0 nodes curve: 1 node ≈ 2200, ×10 nodes per +400 Elo. */
export function lc0Nodes(elo: number): number {
	if (elo <= LC0_ONE_NODE_ELO) return 1;
	return Math.max(1, Math.round(10 ** ((elo - LC0_ONE_NODE_ELO) / 400)));
}

function lc0Plan(elo: number | undefined, movetimeMs: number): Omit<StrengthPlan, 'minDelayMs'> {
	if (elo === undefined) return { options: {}, go: { movetimeMs }, blunderChance: 0 };
	return { options: {}, go: { movetimeMs, nodes: lc0Nodes(elo) }, blunderChance: blendChance(elo, LC0_ONE_NODE_ELO) };
}

function maiaPlan(meta: EngineMeta, elo: number | undefined): Omit<StrengthPlan, 'minDelayMs'> {
	const target = elo ?? meta.eloRange[1];
	const plan: Omit<StrengthPlan, 'minDelayMs'> = {
		options: {},
		go: meta.kind === 'remote' ? { nodes: 1 } : {},
		blunderChance: blendChance(target, MAIA_BUCKETS[0]!),
		ratingBucket: nearestMaiaBucket(target),
		temperature: elo === undefined ? 0 : MAIA_TEMPERATURE,
	};
	return plan;
}

export function resolveStrength(meta: EngineMeta, targetElo: number | undefined, think: ThinkSetting): StrengthPlan {
	const movetimeMs = thinkMs(think);
	const elo = targetElo === undefined || !Number.isFinite(targetElo) ? undefined : targetElo;
	let plan: Omit<StrengthPlan, 'minDelayMs'>;
	switch (meta.family) {
		case 'stockfish':
			plan = stockfishPlan(elo, movetimeMs);
			break;
		case 'fairy':
			plan = fairyPlan(meta, elo, movetimeMs);
			break;
		case 'komodo':
			plan = komodoPlan(meta, elo, movetimeMs);
			break;
		case 'lc0':
			plan = lc0Plan(elo, movetimeMs);
			break;
		case 'maia':
			plan = maiaPlan(meta, elo);
			break;
	}
	return { ...plan, minDelayMs: MIN_HUMAN_DELAY_MS };
}

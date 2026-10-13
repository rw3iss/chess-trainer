// Pure BotModal form model: presets, defaults and the BotSetup it produces.
import type { Color } from '@chess/core/chess';
import { CLOCK_PRESETS } from '@chess/core/clock';
import type { EngineMeta } from '@chess/core/engine';
import type { Session, ThinkPreset, ThinkSetting } from '@chess/core/game';
import type { BotSetup } from '@/state/engines';

export type UserColor = Color | 'random';
export type ThinkChoice = ThinkPreset | 'custom';

export interface EloPreset {
	id: string;
	label: string;
	/** null = the engine's maximum. */
	elo: number | null;
}

export const ELO_PRESETS: EloPreset[] = [
	{ id: 'beginner', label: 'Beginner', elo: 600 },
	{ id: 'casual', label: 'Casual', elo: 1000 },
	{ id: 'club', label: 'Club', elo: 1500 },
	{ id: 'strong', label: 'Strong', elo: 2000 },
	{ id: 'master', label: 'Master', elo: 2500 },
	{ id: 'max', label: 'Max', elo: null },
];

export const THINK_CHOICES: { value: ThinkChoice; label: string; title: string }[] = [
	{ value: 'instant', label: 'Instant', title: '≈ 50 ms' },
	{ value: 'fast', label: 'Fast', title: '≈ 0.3 s' },
	{ value: 'normal', label: 'Normal', title: '≈ 1 s' },
	{ value: 'deep', label: 'Deep', title: '≈ 3 s' },
	{ value: 'custom', label: 'Custom', title: 'Custom milliseconds' },
];

export const DEFAULT_CLOCK_PRESET = '5+3';
export const CUSTOM_MS_MIN = 20;
export const CUSTOM_MS_MAX = 60_000;

export interface BotFormState {
	engineId: string;
	elo: number;
	userColor: UserColor;
	think: ThinkChoice;
	customMs: number;
	clockOn: boolean;
	clockPreset: string;
	allowTakebacks: boolean;
}

export function clampElo(elo: number, range: [number, number]): number {
	return Math.max(range[0], Math.min(range[1], Math.round(elo)));
}

export function presetElo(p: EloPreset, range: [number, number]): number {
	return p.elo === null ? range[1] : clampElo(p.elo, range);
}

/** A preset is offered only if it lies within the engine's range (Max always). */
export function presetEnabled(p: EloPreset, range: [number, number]): boolean {
	return p.elo === null || (p.elo >= range[0] && p.elo <= range[1]);
}

export function thinkSetting(choice: ThinkChoice, customMs: number): ThinkSetting {
	return choice === 'custom' ? { movetimeMs: Math.max(CUSTOM_MS_MIN, Math.min(CUSTOM_MS_MAX, Math.round(customMs))) } : { preset: choice };
}

function thinkChoiceOf(t: ThinkSetting): { think: ThinkChoice; customMs: number } {
	return 'movetimeMs' in t ? { think: 'custom', customMs: t.movetimeMs } : { think: t.preset, customMs: 1000 };
}

/** Initial form: the session's current bot (editing) or the user's defaults. */
export function initialForm(
	session: Session | null,
	defaults: { engineId: string; elo: number; think: ThinkSetting },
	meta: (id: string) => EngineMeta | undefined,
): BotFormState {
	const bot = session?.mode === 'bot' ? session.bot : undefined;
	const engineId = bot?.engineId ?? defaults.engineId;
	const range = meta(engineId)?.eloRange ?? [400, 3190];
	const fen = session ? session.tree.nodes[session.cursor]?.fen : undefined;
	// Default: you play the side to move (so you move first and the bot answers).
	const toMove: Color = fen?.split(' ')[1] === 'b' ? 'black' : 'white';
	const userColor: Color = bot ? (bot.color === 'white' ? 'black' : 'white') : toMove;
	const clockPreset = session?.clock ? (CLOCK_PRESETS.find((p) => p.config.initialMs === session.clock!.config.initialMs && p.config.incrementMs === session.clock!.config.incrementMs)?.id ?? DEFAULT_CLOCK_PRESET) : DEFAULT_CLOCK_PRESET;
	return {
		engineId,
		elo: clampElo(bot?.targetElo ?? defaults.elo, range),
		userColor,
		...thinkChoiceOf(bot?.think ?? defaults.think),
		clockOn: !!session?.clock,
		clockPreset,
		allowTakebacks: bot?.allowTakebacks ?? true,
	};
}

/** Form → BotSetup for botActions.attach. */
export function toSetup(f: BotFormState): BotSetup & { userColor: UserColor } {
	const clock = f.clockOn ? (CLOCK_PRESETS.find((p) => p.id === f.clockPreset)?.config ?? null) : null;
	return {
		engineId: f.engineId,
		targetElo: f.elo,
		// Placeholder; attach() derives the bot colour from userColor.
		color: f.userColor === 'white' ? 'black' : 'white',
		userColor: f.userColor,
		think: thinkSetting(f.think, f.customMs),
		allowTakebacks: f.allowTakebacks,
		clock: clock ? { ...clock } : null,
	};
}

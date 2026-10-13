// Settings store — every user preference, persisted (SettingsRepository 'app').
// Sections mirror /settings/:section. Read `settings.value.<section>`; write with
// updateSettings({ section: { key: value } }) (deep-merged, debounced persist).
import { computed, signal } from '@preact/signals';
import type { Color } from '@chess/core/chess';
import type { PlaybackSpeed, ThinkSetting } from '@chess/core/game';
import { DEFAULT_APP_THEME, DEFAULT_BOARD_THEME_ID, DEFAULT_PIECE_THEME_ID, type AppThemeSettings, type PieceSideColors } from '@chess/core/theme';
import { PLAYBACK_INTERVAL_MS } from '@chess/core/game';
import { DEFAULT_SERVER_URL } from '@/services/server';
import { getRepositories } from '@/services/db';
import { debounce } from '@/lib/throttle';
import { defineStore } from './registry';

export const SETTINGS_KEY = 'app';
const PERSIST_DEBOUNCE_MS = 300;
/** localStorage mirror so index.html can apply the theme before JS boots. */
export const THEME_BOOT_KEY = 'chess:theme-boot';

export interface BoardDisplaySettings {
	coordinates: 'inside' | 'outside' | 'none';
	showLegalDots: boolean;
	showLastMove: boolean;
	showCheck: boolean;
	input: 'drag' | 'click' | 'both';
	/** Piece animation ms (0 = off). */
	animationMs: number;
	showEvalBar: boolean;
	showArrows: boolean;
	/** Colour-blind-safe highlight palette. */
	colorBlindHighlights: boolean;
}

export interface ClockSettings {
	presetId: string;
	placement: 'side' | 'top-bottom' | 'overlay';
	size: 'S' | 'M' | 'L';
	lowTimeMs: number;
	tenths: boolean;
	pauseOnHidden: boolean;
	sound: boolean;
}

export interface EngineSettings {
	defaultEngineId: string;
	defaultElo: number;
	think: ThinkSetting;
	/** Minimum delay before a bot move appears (ms). */
	humanDelayMs: number;
}

export interface AppSettings {
	version: 1;
	theme: AppThemeSettings;
	motion: 'system' | 'reduced' | 'full';
	sounds: { enabled: boolean; volume: number };
	board: BoardDisplaySettings;
	boardThemeId: string;
	pieceThemeId: string;
	/** Per-side overrides layered on top of the piece theme colours. */
	pieceColorOverrides: Partial<Record<Color, Partial<PieceSideColors>>>;
	/** ms per move for each playback speed. */
	playback: Record<PlaybackSpeed, number>;
	defaultPlaybackSpeed: PlaybackSpeed;
	clock: ClockSettings;
	engine: EngineSettings;
	/** url '' = no server configured. */
	server: { url: string; sync: boolean };
	openings: { loadReusesUntouched: boolean };
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const DEFAULT_SETTINGS: AppSettings = {
	version: 1,
	theme: { ...DEFAULT_APP_THEME },
	motion: 'system',
	sounds: { enabled: true, volume: 0.6 },
	board: {
		coordinates: 'inside',
		showLegalDots: true,
		showLastMove: true,
		showCheck: true,
		input: 'both',
		animationMs: 180,
		showEvalBar: true,
		showArrows: true,
		colorBlindHighlights: false,
	},
	boardThemeId: DEFAULT_BOARD_THEME_ID,
	pieceThemeId: DEFAULT_PIECE_THEME_ID,
	pieceColorOverrides: {},
	playback: { ...PLAYBACK_INTERVAL_MS },
	defaultPlaybackSpeed: 'medium',
	clock: { presetId: '5+3', placement: 'top-bottom', size: 'M', lowTimeMs: 20_000, tenths: true, pauseOnHidden: true, sound: true },
	engine: { defaultEngineId: 'sf-lite', defaultElo: 1500, think: { preset: 'normal' }, humanDelayMs: 400 },
	server: { url: DEFAULT_SERVER_URL, sync: false },
	openings: { loadReusesUntouched: true },
};

const _settings = signal<AppSettings>(DEFAULT_SETTINGS);
const _loaded = signal(false);

export const settings = computed(() => _settings.value);
export const settingsLoaded = computed(() => _loaded.value);

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge (objects merge, everything else replaces). Pure. */
export function deepMerge<T>(base: T, patch: unknown): T {
	if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
	const out: Record<string, unknown> = { ...base };
	for (const [k, v] of Object.entries(patch)) {
		if (v === undefined) continue;
		out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
	}
	return out as T;
}

const persist = debounce((value: AppSettings) => {
	void getRepositories().settings.set(SETTINGS_KEY, value);
}, PERSIST_DEBOUNCE_MS);

function mirrorThemeBoot(value: AppSettings): void {
	try {
		localStorage.setItem(THEME_BOOT_KEY, JSON.stringify({ mode: value.theme.mode, accent: value.theme.accent, density: value.theme.density }));
	} catch {
		/* private mode */
	}
}

export function updateSettings(patch: DeepPartial<AppSettings>): void {
	const next = deepMerge(_settings.value, patch);
	_settings.value = next;
	mirrorThemeBoot(next);
	persist(next);
}

/** Replace one whole section (useful when a nested Partial merge is wrong, e.g. clearing overrides). */
export function replaceSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
	const next = { ..._settings.value, [key]: value };
	_settings.value = next;
	mirrorThemeBoot(next);
	persist(next);
}

export function resetSettings(): void {
	_settings.value = DEFAULT_SETTINGS;
	mirrorThemeBoot(DEFAULT_SETTINGS);
	persist(DEFAULT_SETTINGS);
}

export async function loadSettings(): Promise<void> {
	const stored = await getRepositories().settings.get<DeepPartial<AppSettings>>(SETTINGS_KEY);
	_settings.value = stored ? deepMerge(DEFAULT_SETTINGS, stored) : DEFAULT_SETTINGS;
	mirrorThemeBoot(_settings.value);
	_loaded.value = true;
}

defineStore({
	name: 'settings',
	init: loadSettings,
	flush: () => persist.flush(),
	dispose: () => persist.cancel(),
});

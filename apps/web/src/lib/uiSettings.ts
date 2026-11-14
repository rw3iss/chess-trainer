// UI settings registry — every persisted "app view" preference, with its default, in one place.
//
// Values live in localStorage (via `uiStorage`, prefix `ui:`); a key that was never changed reads
// its default, so changing a default here applies to everyone who has not touched it.
// In components use the hook:   const [keep, setKeep] = useUISetting('openings.keepPosition');
// Outside components:           getUISetting('play.opponent') / setUISetting(…)
// To add a setting: add the key + type to `UISettings` and its default to `UI_SETTING_DEFAULTS`.
// App settings that sync or belong to the domain (themes, engine, clock…) stay in `state/settings`.
import { uiStorage } from './storage';

export interface UISettings {
	/** Moves panel → Variations: load a variation at the current move. */
	'openings.keepPosition': boolean;
	/** Openings browser: family groups the user expanded. */
	'openings.expandedFamilies': string[];
	/** Openings browser: filter panel open. */
	'openings.showFilters': boolean;
	/** Theory notes: show the full text instead of the clamped preview. */
	'notes.expandTheory': boolean;
	/** Saved games: filter panel open. */
	'games.showFilters': boolean;
	/** Play page: last opponent type. */
	'play.opponent': 'bot' | 'local';
	/** Settings → Engines: comparison table instead of cards. */
	'engines.compareTable': boolean;
}

export type UISettingKey = keyof UISettings;

export const UI_SETTING_DEFAULTS: UISettings = {
	'openings.keepPosition': true,
	'openings.expandedFamilies': [],
	'openings.showFilters': false,
	'notes.expandTheory': false,
	'games.showFilters': false,
	'play.opponent': 'bot',
	'engines.compareTable': false,
};

export function getUISetting<K extends UISettingKey>(key: K): UISettings[K] {
	return uiStorage.get<UISettings[K]>(key, UI_SETTING_DEFAULTS[key]) as UISettings[K];
}

export function setUISetting<K extends UISettingKey>(key: K, value: UISettings[K]): void {
	uiStorage.set(key, value);
}

/** Forget every stored UI setting (all keys read their defaults again). */
export function resetUISettings(): void {
	for (const key of Object.keys(UI_SETTING_DEFAULTS) as UISettingKey[]) uiStorage.remove(key);
}

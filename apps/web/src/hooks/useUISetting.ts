// Typed, persisted UI setting (see lib/uiSettings.ts for the registry of keys + defaults).
//   const [keep, setKeep] = useUISetting('openings.keepPosition');
import { UI_SETTING_DEFAULTS, type UISettingKey, type UISettings } from '@/lib/uiSettings';
import { useUIState } from './useUIState';

export function useUISetting<K extends UISettingKey>(key: K): [UISettings[K], (next: UISettings[K] | ((prev: UISettings[K]) => UISettings[K])) => void] {
	return useUIState<UISettings[K]>(key, UI_SETTING_DEFAULTS[key]);
}

// App theme (light / dark / system) + appearance application.
//   const { mode, resolved, setMode, toggle } = useTheme();
// useApplyAppearance() is mounted once (App) and writes <html> data-theme,
// data-density, data-motion, --color-accent and --font-scale from settings.
import { useEffect } from 'preact/hooks';
import { useComputed, useSignalEffect } from '@preact/signals';
import type { AppThemeMode } from '@chess/core/theme';
import { settings, updateSettings } from '@/state/settings';
import { readableOn } from '@/lib/color';
import { useMediaQuery } from './useMediaQuery';

export type ResolvedTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const LIGHT_QUERY = '(prefers-color-scheme: light)';

export function resolveTheme(mode: AppThemeMode, systemPrefersLight: boolean): ResolvedTheme {
	if (mode === 'system') return systemPrefersLight ? 'light' : 'dark';
	return mode;
}

export function useTheme(): { mode: AppThemeMode; resolved: ResolvedTheme; setMode: (m: AppThemeMode) => void; toggle: () => void } {
	const systemLight = useMediaQuery(LIGHT_QUERY);
	const mode = useComputed(() => settings.value.theme.mode).value;
	const resolved = resolveTheme(mode, systemLight);
	return {
		mode,
		resolved,
		setMode: (m) => updateSettings({ theme: { mode: m } }),
		toggle: () => updateSettings({ theme: { mode: resolved === 'dark' ? 'light' : 'dark' } }),
	};
}

/** Mount once at the root. */
export function useApplyAppearance(): void {
	const systemLight = useMediaQuery(LIGHT_QUERY);
	// Keep a dark query subscription too, so 'no-preference' resolves to dark (the default).
	useMediaQuery(DARK_QUERY);

	useSignalEffect(() => {
		const s = settings.value;
		const root = document.documentElement;
		root.dataset.density = s.theme.density;
		root.style.setProperty('--font-scale', String(s.theme.fontScale));
		if (s.theme.accent) {
			root.style.setProperty('--color-accent', s.theme.accent);
			root.style.setProperty('--color-accent-fg', readableOn(s.theme.accent));
		}
		if (s.motion === 'reduced') root.dataset.motion = 'reduced';
		else delete root.dataset.motion;
	});

	useEffect(() => {
		// Theme depends on both settings and the OS preference.
		return settings.subscribe((s) => {
			const resolved = resolveTheme(s.theme.mode, systemLight);
			document.documentElement.dataset.theme = resolved;
			const meta = document.querySelector('meta[name="theme-color"]');
			meta?.setAttribute('content', resolved === 'light' ? '#f3eee4' : '#0e0f12');
		});
	}, [systemLight]);
}

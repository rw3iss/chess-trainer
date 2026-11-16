// Settings → App: theme, accent, density, font scale, opening stats database, sounds, animation, motion.
import type { JSX } from 'preact';
import { DEFAULT_APP_THEME, type AppThemeMode } from '@chess/core/theme';
import { Button, ColorPicker, DEFAULT_SWATCHES, SegmentedControl, Slider, Toggle } from '@/components/common';
import { sound } from '@/services/sound';
import {
	BOARD_SHADOW_EXTRA_Y,
	BOARD_SHADOW_SIZE,
	BOARD_SHADOW_THEME_COLORS,
	DEFAULT_SETTINGS,
	settings,
	updateSettings,
	type AppSettings,
} from '@/state/settings';
import { AlphaColorField } from '@/components/theme/pickers';
import { STATS_SOURCE_HINTS, StatsSourceControl } from '@/components/openings/StatsSourceControl';
import { useTheme } from '@/hooks/useTheme';
import { SectionHeader, SettingsGroup, SettingsRow } from '../SettingsLayout';

const MODES: { value: AppThemeMode; label: string; icon: 'sun' | 'moon' | 'monitor' }[] = [
	{ value: 'light', label: 'Light', icon: 'sun' },
	{ value: 'dark', label: 'Dark', icon: 'moon' },
	{ value: 'system', label: 'System', icon: 'monitor' },
];

const DENSITIES: { value: AppSettings['theme']['density']; label: string }[] = [
	{ value: 'comfortable', label: 'Comfortable' },
	{ value: 'compact', label: 'Compact' },
];

const MOTION: { value: AppSettings['motion']; label: string }[] = [
	{ value: 'system', label: 'System' },
	{ value: 'reduced', label: 'Reduced' },
	{ value: 'full', label: 'Full' },
];

/** Animation speed presets → duration multiplier. */
const SPEEDS: { value: string; label: string; scale: number }[] = [
	{ value: 'snappy', label: 'Snappy', scale: 0.6 },
	{ value: 'normal', label: 'Normal', scale: 1 },
	{ value: 'relaxed', label: 'Relaxed', scale: 1.5 },
];

function speedOf(scale: number): string {
	return SPEEDS.reduce((best, s) => (Math.abs(s.scale - scale) < Math.abs(best.scale - scale) ? s : best), SPEEDS[1]!).value;
}

export function AppSection(): JSX.Element {
	const s = settings.value;
	return (
		<div class="settings-section">
			<SectionHeader title="App" description="Appearance, sound and motion for the whole app." />
			<SettingsGroup title="Appearance">
				<SettingsRow label="Theme">
					<SegmentedControl options={MODES} value={s.theme.mode} onChange={(mode) => updateSettings({ theme: { mode } })} ariaLabel="Theme" size="sm" />
				</SettingsRow>
				<SettingsRow label="Accent color" hint="Buttons, highlights and focus rings." stacked>
					<div class="settings-inline">
						<ColorPicker value={s.theme.accent} onChange={(accent) => updateSettings({ theme: { accent } })} swatches={DEFAULT_SWATCHES} label="Accent" />
						{s.theme.accent !== DEFAULT_APP_THEME.accent && (
							<Button size="sm" variant="ghost" icon="undo" onClick={() => updateSettings({ theme: { accent: DEFAULT_APP_THEME.accent } })}>
								Reset
							</Button>
						)}
					</div>
				</SettingsRow>
				<SettingsRow label="Density">
					<SegmentedControl options={DENSITIES} value={s.theme.density} onChange={(density) => updateSettings({ theme: { density } })} ariaLabel="Density" size="sm" />
				</SettingsRow>
				<SettingsRow label="Text size" stacked>
					<Slider min={85} max={130} step={5} value={Math.round(s.theme.fontScale * 100)} onChange={(v) => updateSettings({ theme: { fontScale: v / 100 } })} format={(v) => `${v}%`} ariaLabel="Text size" />
				</SettingsRow>
				<Toggle
					checked={s.board.showShadow}
					onChange={(showShadow) => updateSettings({ board: { showShadow } })}
					label="Board shadow"
					description="A soft dark glow around the board for more focus. Add extra top & bottom to darken the player rows and captured pieces."
				/>
				{s.board.showShadow && <BoardShadowControls />}
			</SettingsGroup>

			<SettingsGroup title="Openings">
				<SettingsRow label="Opening stats" hint={`Game counts, W/D/L and popularity come from one database. ${STATS_SOURCE_HINTS.lichess}. ${STATS_SOURCE_HINTS.masters}.`}>
					<StatsSourceControl />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title="Sound" description="Synthesized move, capture, check and game-end sounds.">
				<Toggle checked={s.sounds.enabled} onChange={(enabled) => updateSettings({ sounds: { enabled } })} label="Sounds" />
				<SettingsRow label="Volume" stacked>
					<div class="settings-inline settings-inline--grow">
						<Slider
							min={0}
							max={100}
							value={Math.round(s.sounds.volume * 100)}
							onChange={(v) => updateSettings({ sounds: { volume: v / 100 } })}
							format={(v) => `${v}%`}
							disabled={!s.sounds.enabled}
							ariaLabel="Volume"
						/>
						<Button size="sm" variant="secondary" icon="play" disabled={!s.sounds.enabled} onClick={() => sound.play('capture')}>
							Test
						</Button>
					</div>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title="Motion">
				<SettingsRow label="Animation speed" hint="Panels, menus and transitions.">
					<SegmentedControl
						options={SPEEDS.map(({ value, label }) => ({ value, label }))}
						value={speedOf(s.animationScale)}
						onChange={(v) => updateSettings({ animationScale: SPEEDS.find((x) => x.value === v)?.scale ?? 1 })}
						ariaLabel="Animation speed"
						size="sm"
					/>
				</SettingsRow>
				<SettingsRow label="Reduced motion" hint="System follows your device setting.">
					<SegmentedControl options={MOTION} value={s.motion} onChange={(motion) => updateSettings({ motion })} ariaLabel="Reduced motion" size="sm" />
				</SettingsRow>
			</SettingsGroup>
		</div>
	);
}

/** Board shadow color (with opacity), size and extra top/bottom. Color '' follows the theme. */
function BoardShadowControls(): JSX.Element {
	const b = settings.value.board;
	const { resolved } = useTheme();
	const themeColor = BOARD_SHADOW_THEME_COLORS[resolved === 'light' ? 'light' : 'dark'];
	const d = DEFAULT_SETTINGS.board;
	const isDefault = !b.shadowColor && b.shadowSize === d.shadowSize && b.shadowExtraY === d.shadowExtraY;
	return (
		<div class="board-shadow-controls">
			<SettingsRow label="Shadow color" hint={b.shadowColor ? 'Center color; it fades to transparent.' : 'Theme default. Pick a color to override it.'} stacked>
				<AlphaColorField label="Color & opacity" value={b.shadowColor || themeColor} onChange={(shadowColor) => updateSettings({ board: { shadowColor } })} />
			</SettingsRow>
			<SettingsRow label="Shadow size" hint="How far it reaches past the board; larger is softer." stacked>
				<Slider
					min={BOARD_SHADOW_SIZE.min}
					max={BOARD_SHADOW_SIZE.max}
					step={2}
					value={b.shadowSize}
					onChange={(shadowSize) => updateSettings({ board: { shadowSize } })}
					format={(v) => `${v}px`}
					ariaLabel="Shadow size"
				/>
			</SettingsRow>
			<SettingsRow label="Extra top & bottom" hint="Adds to the top and bottom only — more contrast behind the player rows and captured pieces." stacked>
				<Slider
					min={BOARD_SHADOW_EXTRA_Y.min}
					max={BOARD_SHADOW_EXTRA_Y.max}
					step={2}
					value={b.shadowExtraY}
					onChange={(shadowExtraY) => updateSettings({ board: { shadowExtraY } })}
					format={(v) => `${v}px`}
					ariaLabel="Extra top and bottom"
				/>
			</SettingsRow>
			<div class="board-shadow-controls__reset">
				<Button size="sm" variant="ghost" icon="undo" disabled={isDefault} onClick={() => updateSettings({ board: { shadowColor: '', shadowSize: d.shadowSize, shadowExtraY: d.shadowExtraY } })}>
					Reset shadow
				</Button>
			</div>
		</div>
	);
}

// Settings → Clock: default time control (presets / custom / delay), placement,
// size, low-time warning, tenths, sound, pause on tab switch — with a live preview.
import { useMemo } from 'preact/hooks';
import type { JSX } from 'preact';
import { createClock } from '@chess/core/clock';
import { createSession, type Session } from '@chess/core/game';
import { SegmentedControl, Slider, Toggle } from '@/components/common';
import { Clock, ClockConfigForm, clockController, resolveClockConfig } from '@/components/clock';
import { settings, updateSettings, type ClockSettings } from '@/state/settings';
import { SectionHeader, SettingsGroup, SettingsRow } from '../SettingsLayout';

const PLACEMENTS: { value: ClockSettings['placement']; label: string }[] = [
	{ value: 'top-bottom', label: 'Top & bottom' },
	{ value: 'side', label: 'Side' },
	{ value: 'overlay', label: 'Overlay' },
];

const SIZES: { value: ClockSettings['size']; label: string }[] = [
	{ value: 'S', label: 'S' },
	{ value: 'M', label: 'M' },
	{ value: 'L', label: 'L' },
];

function previewSession(c: ClockSettings): Session {
	const config = resolveClockConfig(c);
	const base = createClock(config);
	const now = clockController.now.peek();
	const low = Math.max(1000, Math.min(config.initialMs, c.lowTimeMs) - 1500);
	return {
		...createSession({ id: 'clock-preview', mode: 'local-pvp' }),
		clock: { ...base, remaining: { white: config.initialMs, black: c.lowTimeMs > 0 ? low : 8_400 }, running: 'white', lastStartedAt: now, toMove: 'white' },
	};
}

const set = (patch: Partial<ClockSettings>) => updateSettings({ clock: patch });

export function ClockSection(): JSX.Element {
	const c = settings.value.clock;
	const demo = useMemo(() => previewSession(c), [c]);

	return (
		<div class="settings-section">
			<SectionHeader title="Clock" description="Defaults for local games with a chess clock." />
			<SettingsGroup title="Default time control">
				<ClockConfigForm value={c} onChange={(v) => set(v)} />
			</SettingsGroup>

			<SettingsGroup title="Display">
				<div class="settings-clock-preview" aria-hidden="true">
					<Clock session={demo} color="black" />
					<Clock session={demo} color="white" />
				</div>
				<SettingsRow label="Placement" hint="Where clocks sit around the board.">
					<SegmentedControl options={PLACEMENTS} value={c.placement} onChange={(placement) => set({ placement })} ariaLabel="Placement" size="sm" />
				</SettingsRow>
				<SettingsRow label="Size">
					<SegmentedControl options={SIZES} value={c.size} onChange={(size) => set({ size })} ariaLabel="Clock size" size="sm" />
				</SettingsRow>
				<SettingsRow label="Low-time warning" stacked>
					<Slider
						min={0}
						max={60}
						value={Math.round(c.lowTimeMs / 1000)}
						onChange={(v) => set({ lowTimeMs: v * 1000 })}
						format={(v) => (v === 0 ? 'Off' : `${v} s`)}
						ariaLabel="Low-time warning"
					/>
				</SettingsRow>
				<Toggle checked={c.tenths} onChange={(tenths) => set({ tenths })} label="Tenths of a second" description="Shown under 10 seconds." />
				<Toggle checked={c.sound} onChange={(sound) => set({ sound })} label="Low-time sound" />
				<Toggle checked={c.pauseOnHidden} onChange={(pauseOnHidden) => set({ pauseOnHidden })} label="Pause when the app is hidden" description="Switching tabs or apps pauses a local game's clock." />
			</SettingsGroup>
		</div>
	);
}

// Settings → Board: theme gallery, coordinates, highlights, arrows, animation,
// input mode, eval bar and playback speeds.
import type { JSX } from 'preact';
import { PLAYBACK_INTERVAL_MS, type PlaybackSpeed } from '@chess/core/game';
import { Button, ColorPicker, SegmentedControl, Slider, Toggle } from '@/components/common';
import { BoardThemeCard, hexOf } from '@/components/theme';
import { settings, updateSettings, type BoardDisplaySettings } from '@/state/settings';
import { activeBoardTheme, activePieceSet, activePieceTheme, boardThemes } from '@/state/themes';
import { SectionHeader, SettingsGroup, SettingsRow } from '../SettingsLayout';

const COORDS: { value: BoardDisplaySettings['coordinates']; label: string }[] = [
	{ value: 'inside', label: 'Inside' },
	{ value: 'outside', label: 'Outside' },
	{ value: 'none', label: 'None' },
];

const INPUTS: { value: BoardDisplaySettings['input']; label: string }[] = [
	{ value: 'both', label: 'Both' },
	{ value: 'drag', label: 'Drag' },
	{ value: 'click', label: 'Click' },
];

const ARROW_SWATCHES = ['#15781b', '#e8a317', '#2f6fd0', '#c8342b', '#8a4fc9', '#ffffff'];

const SPEED_ROWS: { key: PlaybackSpeed; label: string; min: number; max: number }[] = [
	{ key: 'slow', label: 'Slow', min: 1000, max: 6000 },
	{ key: 'medium', label: 'Medium', min: 400, max: 3000 },
	{ key: 'fast', label: 'Fast', min: 100, max: 1500 },
];

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`;

const setBoard = (patch: Partial<BoardDisplaySettings>) => updateSettings({ board: patch });

export function BoardSection(): JSX.Element {
	const s = settings.value;
	const b = s.board;
	const pieceTheme = activePieceTheme.value;
	const pieceSet = activePieceSet.value;
	const themeArrow = activeBoardTheme.value?.highlights.arrow ?? '#15781b';

	return (
		<div class="settings-section">
			<SectionHeader title="Board" description="How the board looks and responds." />
			<SettingsGroup title="Board theme" description="Create your own in the Theme editor.">
				{pieceTheme && pieceSet && (
					<div class="theme-gallery" role="radiogroup" aria-label="Board theme">
						{boardThemes.value.map((t) => (
							<BoardThemeCard key={t.id} theme={t} pieceTheme={pieceTheme} pieceSet={pieceSet} selected={s.boardThemeId === t.id} onSelect={() => updateSettings({ boardThemeId: t.id })} />
						))}
					</div>
				)}
			</SettingsGroup>

			<SettingsGroup title="Display">
				<SettingsRow label="Coordinates">
					<SegmentedControl options={COORDS} value={b.coordinates} onChange={(coordinates) => setBoard({ coordinates })} ariaLabel="Coordinates" size="sm" />
				</SettingsRow>
				<Toggle checked={b.showLastMove} onChange={(showLastMove) => setBoard({ showLastMove })} label="Highlight last move" />
				<Toggle checked={b.showCheck} onChange={(showCheck) => setBoard({ showCheck })} label="Highlight check" />
				<Toggle checked={b.showLegalDots} onChange={(showLegalDots) => setBoard({ showLegalDots })} label="Legal move dots" />
				<Toggle checked={b.colorBlindHighlights} onChange={(colorBlindHighlights) => setBoard({ colorBlindHighlights })} label="Colour-blind friendly highlights" />
				<Toggle checked={b.showEvalBar} onChange={(showEvalBar) => setBoard({ showEvalBar })} label="Show evaluation bar" description="While engine analysis runs." />
				<Toggle checked={b.showArrows} onChange={(showArrows) => setBoard({ showArrows })} label="Show arrows" description="Engine best lines and your right-drag arrows." />
				<SettingsRow label="Arrow colour" hint={b.arrowColor ? 'Custom colour.' : 'Using the board theme colour.'} stacked>
					<div class="settings-inline">
						<ColorPicker value={b.arrowColor || hexOf(themeArrow)} onChange={(arrowColor) => setBoard({ arrowColor })} swatches={ARROW_SWATCHES} label="Arrow colour" />
						{b.arrowColor && (
							<Button size="sm" variant="ghost" icon="undo" onClick={() => setBoard({ arrowColor: '' })}>
								Theme default
							</Button>
						)}
					</div>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title="Moving pieces">
				<SettingsRow label="Input">
					<SegmentedControl options={INPUTS} value={b.input} onChange={(input) => setBoard({ input })} ariaLabel="Input" size="sm" />
				</SettingsRow>
				<SettingsRow label="Piece animation" stacked>
					<Slider min={0} max={400} step={20} value={b.animationMs} onChange={(animationMs) => setBoard({ animationMs })} format={(v) => (v === 0 ? 'Off' : `${v} ms`)} ariaLabel="Piece animation" />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup
				title="Playback speeds"
				description="Time per move when auto-playing a line."
				actions={
					<Button size="sm" variant="ghost" icon="undo" onClick={() => updateSettings({ playback: { ...PLAYBACK_INTERVAL_MS } })}>
						Reset
					</Button>
				}
			>
				{SPEED_ROWS.map((r) => (
					<SettingsRow key={r.key} label={r.label} stacked>
						<Slider min={r.min} max={r.max} step={50} value={s.playback[r.key]} onChange={(v) => updateSettings({ playback: { [r.key]: v } })} format={seconds} ariaLabel={`${r.label} playback`} />
					</SettingsRow>
				))}
				<SettingsRow label="Default speed">
					<SegmentedControl
						options={SPEED_ROWS.map((r) => ({ value: r.key, label: r.label }))}
						value={s.defaultPlaybackSpeed}
						onChange={(defaultPlaybackSpeed) => updateSettings({ defaultPlaybackSpeed })}
						ariaLabel="Default speed"
						size="sm"
					/>
				</SettingsRow>
			</SettingsGroup>
		</div>
	);
}

// Settings → Pieces: piece-theme gallery (licence badges), per-side colour
// overrides layered on the active theme, shading / shadow, reset.
import type { JSX } from 'preact';
import type { Color, Role } from '@chess/core/chess';
import type { PieceSideColors } from '@chess/core/theme';
import { Button, Slider } from '@/components/common';
import { ColorField, PieceSetPreview, PieceThemeCard } from '@/components/theme';
import { replaceSetting, settings, updateSettings } from '@/state/settings';
import { activeBoardTheme, activePieceSet, activePieceTheme, baseActivePieceTheme, pieceSets, pieceThemes } from '@/state/themes';
import { SectionHeader, SettingsGroup } from '../SettingsLayout';

const FIELDS: { key: keyof PieceSideColors; label: string }[] = [
	{ key: 'body', label: 'Body' },
	{ key: 'line', label: 'Outline' },
	{ key: 'accent', label: 'Accent' },
];

const PREVIEW_ROLES: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

function reset(): void {
	replaceSetting('pieceColorOverrides', {});
	replaceSetting('pieceDepthOverrides', {});
}

export function PiecesSection(): JSX.Element {
	const s = settings.value;
	const board = activeBoardTheme.value;
	const active = activePieceTheme.value;
	const base = baseActivePieceTheme.value;
	const set = activePieceSet.value;
	const ov = s.pieceColorOverrides;
	const depth = s.pieceDepthOverrides;
	const hasOverrides = Object.values(ov).some((x) => x && Object.keys(x).length) || depth.shading !== undefined || depth.shadow !== undefined;

	const setColor = (c: Color, key: keyof PieceSideColors, value: string) => {
		const next = { ...ov, [c]: { ...ov[c], [key]: value } };
		// Drop the override when it equals the theme colour.
		if (base && base.colors[c][key] === value) delete next[c]![key];
		replaceSetting('pieceColorOverrides', next);
	};

	return (
		<div class="settings-section">
			<SectionHeader title="Pieces" description="Choose a piece set and fine-tune its colours." />
			<SettingsGroup title="Piece set">
				{board && (
					<div class="theme-gallery theme-gallery--pieces" role="radiogroup" aria-label="Piece set">
						{pieceThemes.value.map((t) => {
							const asset = pieceSets.find((p) => p.id === t.assetId);
							if (!asset) return null;
							return <PieceThemeCard key={t.id} theme={t} pieceSet={asset} boardTheme={board} selected={s.pieceThemeId === t.id} onSelect={() => updateSettings({ pieceThemeId: t.id })} />;
						})}
					</div>
				)}
			</SettingsGroup>

			{active && set && base && (
				<SettingsGroup
					title="Colours"
					description="Overrides apply on top of the selected set. Save a permanent variant in the Theme editor."
					actions={
						<Button size="sm" variant="ghost" icon="undo" onClick={reset} disabled={!hasOverrides}>
							Reset
						</Button>
					}
				>
					<div class="settings-pieces-preview">
						<PieceSetPreview pieceTheme={active} pieceSet={set} boardTheme={board} roles={PREVIEW_ROLES} />
					</div>
					{(['white', 'black'] as const).map((c) => (
						<div class="settings-subgroup" key={c}>
							<h4 class="settings-subgroup__title">{c === 'white' ? 'White' : 'Black'}</h4>
							<div class="settings-color-grid">
								{FIELDS.map((f) => (
									<ColorField key={f.key} label={f.label} value={active.colors[c][f.key]} onChange={(v) => setColor(c, f.key, v)} />
								))}
							</div>
						</div>
					))}
					<Slider label="Shading" min={0} max={100} value={Math.round(active.shading * 100)} onChange={(v) => updateSettings({ pieceDepthOverrides: { shading: v / 100 } })} format={(v) => `${v}%`} />
					<Slider label="Shadow" min={0} max={100} value={Math.round(active.shadow * 100)} onChange={(v) => updateSettings({ pieceDepthOverrides: { shadow: v / 100 } })} format={(v) => `${v}%`} />
				</SettingsGroup>
			)}
		</div>
	);
}

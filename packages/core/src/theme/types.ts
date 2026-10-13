import type { Color } from '../chess/types.js';

/** Per-side piece colors. Applied as CSS vars --pc-body / --pc-line / --pc-accent. */
export interface PieceSideColors {
	body: string;
	line: string;
	accent: string;
}

/**
 * A static piece-set asset produced by tools/piece-assets.
 * Sprite = one SVG file of <symbol>s. Symbol ids:
 *   - 'shared' layout: K Q R B N P (one geometry, colored per side via CSS vars)
 *   - 'per-color' layout: wK … wP, bK … bP
 * Every symbol uses role classes:
 *   .pc-body   fill: var(--pc-body)
 *   .pc-line   stroke/fill: var(--pc-line)
 *   .pc-accent fill: var(--pc-accent)
 *   .pc-shade  neutral white/black gradients (opacity scaled by --pc-shade)
 */
export interface PieceSetAsset {
	id: string;
	name: string;
	author: string;
	license: string;
	sourceUrl?: string;
	/** URL (relative to app base) of the SVG sprite. */
	sprite: string;
	layout: 'shared' | 'per-color';
	viewBox: string;
	defaultColors: Record<Color, PieceSideColors>;
	/** True when only for personal / non-commercial use. */
	personalUseOnly?: boolean;
}

/** User-facing piece theme: an asset + color overrides. Clonable / editable. */
export interface PieceTheme {
	id: string;
	name: string;
	assetId: string;
	builtIn: boolean;
	/** Theme this one was cloned from. */
	baseId?: string;
	colors: Record<Color, PieceSideColors>;
	/** Shading overlay strength 0..1. */
	shading: number;
	/** Drop-shadow strength 0..1. */
	shadow: number;
}

export type BoardTextureKind = 'none' | 'gradient' | 'wood' | 'marble' | 'slate' | 'felt' | 'paper';

export interface BoardTexture {
	kind: BoardTextureKind;
	/** Overlay strength 0..1. */
	intensity: number;
	/** Pattern scale multiplier (1 = default). */
	scale: number;
	seed: number;
}

export interface BoardHighlightColors {
	lastMove: string;
	selected: string;
	check: string;
	moveDest: string;
	premove: string;
	arrow: string;
}

export interface BoardTheme {
	id: string;
	name: string;
	builtIn: boolean;
	baseId?: string;
	light: string;
	dark: string;
	texture: BoardTexture;
	highlights: BoardHighlightColors;
	coords: { light: string; dark: string };
	border?: { color: string; width: number };
}

export type AppThemeMode = 'light' | 'dark' | 'system';

export interface AppThemeSettings {
	mode: AppThemeMode;
	/** Accent color (CSS color). */
	accent: string;
	density: 'compact' | 'comfortable';
	fontScale: number;
}

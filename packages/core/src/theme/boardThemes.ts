import type { BoardHighlightColors, BoardTheme, BoardTexture } from './types.js';

const NO_TEXTURE: BoardTexture = { kind: 'none', intensity: 0, scale: 1, seed: 1 };

/** Highlight palettes tuned per board family. */
const HL_WARM: BoardHighlightColors = {
	lastMove: 'rgba(205, 210, 106, 0.55)',
	selected: 'rgba(20, 85, 30, 0.45)',
	check: 'rgba(230, 40, 30, 0.9)',
	moveDest: 'rgba(20, 85, 30, 0.42)',
	premove: 'rgba(30, 50, 110, 0.45)',
	arrow: 'rgba(21, 120, 27, 0.8)',
};

const HL_GREEN: BoardHighlightColors = {
	lastMove: 'rgba(246, 246, 105, 0.6)',
	selected: 'rgba(186, 202, 68, 0.75)',
	check: 'rgba(235, 50, 35, 0.9)',
	moveDest: 'rgba(0, 0, 0, 0.18)',
	premove: 'rgba(60, 80, 160, 0.45)',
	arrow: 'rgba(255, 170, 0, 0.8)',
};

const HL_COOL: BoardHighlightColors = {
	lastMove: 'rgba(120, 180, 230, 0.45)',
	selected: 'rgba(40, 110, 190, 0.45)',
	check: 'rgba(225, 45, 45, 0.9)',
	moveDest: 'rgba(25, 70, 120, 0.4)',
	premove: 'rgba(120, 60, 160, 0.45)',
	arrow: 'rgba(40, 110, 200, 0.8)',
};

const HL_DARK: BoardHighlightColors = {
	lastMove: 'rgba(214, 170, 90, 0.42)',
	selected: 'rgba(214, 170, 90, 0.55)',
	check: 'rgba(240, 70, 60, 0.9)',
	moveDest: 'rgba(240, 220, 180, 0.32)',
	premove: 'rgba(120, 150, 230, 0.45)',
	arrow: 'rgba(230, 180, 80, 0.8)',
};

export const BUILTIN_BOARD_THEMES: BoardTheme[] = [
	{
		id: 'classic-brown',
		name: 'Classic Brown',
		builtIn: true,
		light: '#f0d9b5',
		dark: '#b58863',
		texture: NO_TEXTURE,
		highlights: HL_WARM,
		coords: { light: '#b58863', dark: '#f0d9b5' },
	},
	{
		id: 'tournament-green',
		name: 'Tournament Green',
		builtIn: true,
		light: '#eeeed2',
		dark: '#769656',
		texture: NO_TEXTURE,
		highlights: HL_GREEN,
		coords: { light: '#769656', dark: '#eeeed2' },
	},
	{
		id: 'ice-blue',
		name: 'Ice Blue',
		builtIn: true,
		light: '#e3eaef',
		dark: '#8ca7b8',
		texture: { kind: 'gradient', intensity: 0.35, scale: 1, seed: 3 },
		highlights: HL_COOL,
		coords: { light: '#7d98a9', dark: '#eef3f6' },
	},
	{
		id: 'slate',
		name: 'Slate',
		builtIn: true,
		light: '#a6adb4',
		dark: '#5f6a74',
		texture: { kind: 'slate', intensity: 0.55, scale: 1, seed: 11 },
		highlights: {
			...HL_COOL,
			lastMove: 'rgba(200, 220, 140, 0.45)',
			moveDest: 'rgba(15, 25, 35, 0.4)',
		},
		coords: { light: '#59636c', dark: '#c6ccd1' },
		border: { color: '#3d454c', width: 0 },
	},
	{
		id: 'walnut',
		name: 'Walnut',
		builtIn: true,
		light: '#d8b58a',
		dark: '#8a5a36',
		texture: { kind: 'wood', intensity: 0.7, scale: 1, seed: 7 },
		highlights: {
			...HL_WARM,
			lastMove: 'rgba(240, 210, 90, 0.45)',
		},
		coords: { light: '#86583a', dark: '#e9cfa9' },
		border: { color: '#4a2e1a', width: 0 },
	},
	{
		id: 'carrara',
		name: 'Carrara',
		builtIn: true,
		light: '#f1efea',
		dark: '#a3a6a8',
		texture: { kind: 'marble', intensity: 0.7, scale: 1, seed: 23 },
		highlights: {
			...HL_COOL,
			lastMove: 'rgba(170, 200, 120, 0.45)',
			moveDest: 'rgba(40, 50, 60, 0.32)',
		},
		coords: { light: '#8c9093', dark: '#f4f3ef' },
	},
	{
		id: 'felt',
		name: 'Felt',
		builtIn: true,
		light: '#8cb38a',
		dark: '#3f6e4b',
		texture: { kind: 'felt', intensity: 0.6, scale: 1, seed: 5 },
		highlights: {
			...HL_GREEN,
			lastMove: 'rgba(240, 230, 120, 0.42)',
			moveDest: 'rgba(10, 30, 15, 0.35)',
		},
		coords: { light: '#3c6a48', dark: '#cfe2cb' },
	},
	{
		id: 'midnight',
		name: 'Midnight',
		builtIn: true,
		light: '#5a6684',
		dark: '#2e354b',
		texture: { kind: 'gradient', intensity: 0.5, scale: 1, seed: 2 },
		highlights: HL_DARK,
		coords: { light: '#2e354b', dark: '#8f9abb' },
	},
	{
		id: 'paper',
		name: 'Paper',
		builtIn: true,
		light: '#f5f0e4',
		dark: '#cdbf9f',
		texture: { kind: 'paper', intensity: 0.6, scale: 1, seed: 17 },
		highlights: {
			...HL_WARM,
			lastMove: 'rgba(214, 180, 70, 0.4)',
			moveDest: 'rgba(90, 70, 40, 0.35)',
		},
		coords: { light: '#9c8c69', dark: '#f8f4ea' },
	},
];

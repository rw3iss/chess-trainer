import type { Color } from '../chess/types.js';
import { newThemeId } from './id.js';
import { BUILTIN_PIECE_SETS } from './pieceSets.generated.js';
import type {
	AppThemeSettings,
	BoardTextureKind,
	BoardTheme,
	PieceSideColors,
	PieceTheme,
} from './types.js';

export { BUILTIN_BOARD_THEMES } from './boardThemes.js';
export { BUILTIN_PIECE_SETS } from './pieceSets.generated.js';

export const DEFAULT_BOARD_THEME_ID = 'walnut';
export const DEFAULT_PIECE_THEME_ID = 'lux';

export const DEFAULT_APP_THEME: AppThemeSettings = {
	mode: 'system',
	accent: '#c9a45c',
	density: 'comfortable',
	fontScale: 1,
};

const SIDES: Color[] = ['white', 'black'];

function copySides(colors: Record<Color, PieceSideColors>): Record<Color, PieceSideColors> {
	return { white: { ...colors.white }, black: { ...colors.black } };
}

/** Shading/shadow defaults: sets with a shade group get full shading. */
export const BUILTIN_PIECE_THEMES: PieceTheme[] = BUILTIN_PIECE_SETS.map((set) => ({
	id: set.id,
	name: set.name,
	assetId: set.id,
	builtIn: true,
	colors: copySides(set.defaultColors),
	shading: 1,
	shadow: 0.5,
}));

export function cloneBoardTheme(theme: BoardTheme, name: string): BoardTheme {
	return {
		...theme,
		id: newThemeId('board'),
		name,
		builtIn: false,
		baseId: theme.id,
		texture: { ...theme.texture },
		highlights: { ...theme.highlights },
		coords: { ...theme.coords },
		border: theme.border ? { ...theme.border } : undefined,
	};
}

export function clonePieceTheme(theme: PieceTheme, name: string): PieceTheme {
	return {
		...theme,
		id: newThemeId('piece'),
		name,
		builtIn: false,
		baseId: theme.id,
		colors: copySides(theme.colors),
	};
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * CSS custom properties for a piece theme. Set on the board root; each piece
 * maps its side vars onto --pc-body / --pc-line / --pc-accent.
 */
export function pieceThemeCssVars(theme: PieceTheme): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const side of SIDES) {
		const c = theme.colors[side];
		vars[`--pc-${side}-body`] = c.body;
		vars[`--pc-${side}-line`] = c.line;
		vars[`--pc-${side}-accent`] = c.accent;
	}
	vars['--pc-shade'] = String(clamp01(theme.shading));
	vars['--pc-shadow'] = String(clamp01(theme.shadow));
	return vars;
}

/** CSS custom properties for a board theme (squares, highlights, coords, texture). */
export function boardThemeCssVars(theme: BoardTheme): Record<string, string> {
	const h = theme.highlights;
	return {
		'--board-light': theme.light,
		'--board-dark': theme.dark,
		'--board-hl-last': h.lastMove,
		'--board-hl-selected': h.selected,
		'--board-hl-check': h.check,
		'--board-hl-dest': h.moveDest,
		'--board-hl-premove': h.premove,
		'--board-arrow': h.arrow,
		'--board-coord-light': theme.coords.light,
		'--board-coord-dark': theme.coords.dark,
		'--board-border-color': theme.border?.color ?? 'transparent',
		'--board-border-width': `${Math.max(0, theme.border?.width ?? 0)}px`,
		'--board-texture-intensity': String(clamp01(theme.texture.intensity)),
	};
}

// ── validation (for JSON import) ───────────────────────────────────────────

const TEXTURE_KINDS: BoardTextureKind[] = ['none', 'gradient', 'wood', 'marble', 'slate', 'felt', 'paper'];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isOptStr = (x: unknown): boolean => x === undefined || isStr(x);

function isSideColors(x: unknown): x is PieceSideColors {
	return isObj(x) && isStr(x.body) && isStr(x.line) && isStr(x.accent);
}

export function validateBoardTheme(x: unknown): x is BoardTheme {
	if (!isObj(x)) return false;
	if (!isStr(x.id) || !isStr(x.name) || typeof x.builtIn !== 'boolean' || !isOptStr(x.baseId)) return false;
	if (!isStr(x.light) || !isStr(x.dark)) return false;
	const t = x.texture;
	if (!isObj(t) || !TEXTURE_KINDS.includes(t.kind as BoardTextureKind)) return false;
	if (!isNum(t.intensity) || !isNum(t.scale) || !isNum(t.seed)) return false;
	const h = x.highlights;
	if (!isObj(h)) return false;
	for (const k of ['lastMove', 'selected', 'check', 'moveDest', 'premove', 'arrow']) {
		if (!isStr(h[k])) return false;
	}
	if (!isObj(x.coords) || !isStr(x.coords.light) || !isStr(x.coords.dark)) return false;
	if (x.border !== undefined) {
		if (!isObj(x.border) || !isStr(x.border.color) || !isNum(x.border.width)) return false;
	}
	return true;
}

export function validatePieceTheme(x: unknown): x is PieceTheme {
	if (!isObj(x)) return false;
	if (!isStr(x.id) || !isStr(x.name) || !isStr(x.assetId) || typeof x.builtIn !== 'boolean') return false;
	if (!isOptStr(x.baseId)) return false;
	if (!isObj(x.colors) || !isSideColors(x.colors.white) || !isSideColors(x.colors.black)) return false;
	return isNum(x.shading) && isNum(x.shadow);
}

export function findPieceSet(id: string) {
	return BUILTIN_PIECE_SETS.find((s) => s.id === id);
}

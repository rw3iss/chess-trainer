import { describe, expect, it } from 'vitest';
import {
	BUILTIN_BOARD_THEMES,
	BUILTIN_PIECE_SETS,
	BUILTIN_PIECE_THEMES,
	DEFAULT_BOARD_THEME_ID,
	DEFAULT_PIECE_THEME_ID,
	boardThemeCssVars,
	cloneBoardTheme,
	clonePieceTheme,
	pieceThemeCssVars,
	validateBoardTheme,
	validatePieceTheme,
} from './index.js';

describe('built-in themes', () => {
	it('has the nine planned board themes with unique ids', () => {
		const ids = BUILTIN_BOARD_THEMES.map((t) => t.id);
		expect(ids).toEqual(['classic-brown', 'tournament-green', 'ice-blue', 'slate', 'walnut', 'carrara', 'felt', 'midnight', 'paper']);
		for (const t of BUILTIN_BOARD_THEMES) expect(validateBoardTheme(t)).toBe(true);
	});
	it('has one piece theme per piece set, and valid defaults', () => {
		expect(BUILTIN_PIECE_SETS.length).toBeGreaterThanOrEqual(2);
		expect(BUILTIN_PIECE_THEMES.map((t) => t.assetId)).toEqual(BUILTIN_PIECE_SETS.map((s) => s.id));
		for (const t of BUILTIN_PIECE_THEMES) expect(validatePieceTheme(t)).toBe(true);
		expect(BUILTIN_BOARD_THEMES.some((t) => t.id === DEFAULT_BOARD_THEME_ID)).toBe(true);
		expect(BUILTIN_PIECE_THEMES.some((t) => t.id === DEFAULT_PIECE_THEME_ID)).toBe(true);
	});
	it('includes the original sets and flags personal-use sets', () => {
		const ids = BUILTIN_PIECE_SETS.map((s) => s.id);
		expect(ids).toEqual(expect.arrayContaining(['lux', 'sleek', 'cburnett']));
		for (const s of BUILTIN_PIECE_SETS.filter((x) => x.license.includes('NC'))) expect(s.personalUseOnly).toBe(true);
	});
});

describe('clone', () => {
	it('clones a board theme deeply with a new id', () => {
		const base = BUILTIN_BOARD_THEMES[0]!;
		const c = cloneBoardTheme(base, 'Mine');
		expect(c.id).not.toBe(base.id);
		expect(c).toMatchObject({ name: 'Mine', builtIn: false, baseId: base.id });
		c.highlights.check = 'red';
		expect(base.highlights.check).not.toBe('red');
	});
	it('clones a piece theme without sharing colour objects', () => {
		const base = BUILTIN_PIECE_THEMES[0]!;
		const c = clonePieceTheme(base, 'Mine');
		c.colors.white.body = '#123456';
		expect(base.colors.white.body).not.toBe('#123456');
		expect(c.baseId).toBe(base.id);
	});
});

describe('css vars', () => {
	it('emits per-side piece vars and clamps strengths', () => {
		const v = pieceThemeCssVars({ ...BUILTIN_PIECE_THEMES[0]!, shading: 2, shadow: -1 });
		expect(Object.keys(v)).toEqual(expect.arrayContaining(['--pc-white-body', '--pc-black-accent', '--pc-shade', '--pc-shadow']));
		expect(v['--pc-shade']).toBe('1');
		expect(v['--pc-shadow']).toBe('0');
	});
	it('emits board vars', () => {
		const t = BUILTIN_BOARD_THEMES.find((x) => x.id === 'walnut')!;
		const v = boardThemeCssVars(t);
		expect(v['--board-light']).toBe(t.light);
		expect(v['--board-hl-check']).toBe(t.highlights.check);
		expect(v['--board-texture-intensity']).toBe(String(t.texture.intensity));
	});
});

describe('validation', () => {
	it('rejects malformed themes', () => {
		expect(validateBoardTheme(null)).toBe(false);
		expect(validateBoardTheme({ ...BUILTIN_BOARD_THEMES[0]!, texture: { kind: 'lava', intensity: 1, scale: 1, seed: 1 } })).toBe(false);
		const p = BUILTIN_PIECE_THEMES[0]!;
		expect(validatePieceTheme({ ...p, colors: { white: p.colors.white } })).toBe(false);
		expect(validatePieceTheme({ ...p, shading: 'x' })).toBe(false);
	});
});

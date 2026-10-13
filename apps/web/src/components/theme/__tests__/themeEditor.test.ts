import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_BOARD_THEMES, BUILTIN_PIECE_THEMES } from '@chess/core/theme';
import { freshRepositories } from '@/state/__tests__/testDb';
import { resetSettings, settings, updateSettings } from '@/state/settings';
import { activeBoardTheme, activePieceTheme, boardThemes, customBoardThemes, loadThemes } from '@/state/themes';
import { formatCssColor, parseCssColor } from '../colorAlpha';
import { exportThemes, importThemes } from '../themeIO';
import { saveThemeDraft, startBoardDraft, startPieceDraft } from '../themeEditorModel';

const walnut = BUILTIN_BOARD_THEMES.find((t) => t.id === 'walnut')!;
const lux = BUILTIN_PIECE_THEMES[0]!;

describe('theme editor model', () => {
	let repos: ReturnType<typeof freshRepositories>['repos'];
	beforeEach(async () => {
		repos = freshRepositories().repos;
		resetSettings();
		await loadThemes();
	});

	it('cloning a built-in makes a new custom draft without touching the source', () => {
		const d = startBoardDraft(walnut);
		expect(d.isNew).toBe(true);
		expect(d.theme.id).not.toBe(walnut.id);
		expect(d.theme).toMatchObject({ builtIn: false, baseId: 'walnut', name: 'Walnut copy' });
		if (d.kind === 'board') d.theme.highlights.arrow = 'red';
		expect(walnut.highlights.arrow).not.toBe('red');
	});

	it('save → persisted in ThemesRepository, listed, and active', async () => {
		const d = startBoardDraft(walnut);
		if (d.kind !== 'board') throw new Error('kind');
		d.theme.light = '#e8d5f2';
		d.theme.dark = '#6a3d8f';
		const saved = await saveThemeDraft(d);
		expect(settings.value.boardThemeId).toBe(saved.id);
		expect(activeBoardTheme.value?.light).toBe('#e8d5f2');
		expect(customBoardThemes.value.map((t) => t.id)).toEqual([saved.id]);
		expect((await repos.themes.listBoard()).map((t) => t.dark)).toEqual(['#6a3d8f']);
		// Reload from the repository.
		await loadThemes();
		expect(boardThemes.value.some((t) => t.id === saved.id)).toBe(true);
	});

	it('editing a custom theme saves in place; "save as new" forks it', async () => {
		const first = await saveThemeDraft(startBoardDraft(walnut));
		const edit = startBoardDraft(customBoardThemes.value[0]!);
		expect(edit.isNew).toBe(false);
		expect(edit.theme.id).toBe(first.id);
		edit.theme.name = 'Renamed';
		await saveThemeDraft(edit);
		expect(customBoardThemes.value).toHaveLength(1);
		expect(customBoardThemes.value[0]!.name).toBe('Renamed');
		const forked = await saveThemeDraft(startBoardDraft(customBoardThemes.value[0]!), true);
		expect(forked.id).not.toBe(first.id);
		expect(customBoardThemes.value).toHaveLength(2);
	});

	it('saving a piece theme activates it and clears colour overrides', async () => {
		updateSettings({ pieceColorOverrides: { white: { body: '#ff0000' } } });
		const d = startPieceDraft(lux);
		if (d.kind !== 'piece') throw new Error('kind');
		d.theme.colors.black.body = '#123456';
		const saved = await saveThemeDraft(d);
		expect(settings.value.pieceThemeId).toBe(saved.id);
		expect(settings.value.pieceColorOverrides).toEqual({});
		expect(activePieceTheme.value?.colors.black.body).toBe('#123456');
	});
});

describe('theme JSON import / export', () => {
	it('round-trips a bundle and re-ids imports as custom themes', () => {
		const json = exportThemes([walnut], [lux]);
		const res = importThemes(json);
		expect(res.errors).toEqual([]);
		expect(res.board).toHaveLength(1);
		expect(res.piece).toHaveLength(1);
		expect(res.board[0]!.id).not.toBe('walnut');
		expect(res.board[0]!.builtIn).toBe(false);
		expect(res.board[0]!.light).toBe(walnut.light);
	});

	it('accepts a single theme object', () => {
		expect(importThemes(JSON.stringify(walnut)).board).toHaveLength(1);
	});

	it('rejects invalid JSON, invalid themes and unknown piece sets', () => {
		expect(importThemes('{nope').errors[0]).toMatch(/JSON/);
		const broken = { ...walnut, texture: { kind: 'lava', intensity: 1, scale: 1, seed: 1 } };
		const res = importThemes(JSON.stringify([broken, { ...lux, assetId: 'does-not-exist' }, { hello: 1 }]));
		expect(res.board).toHaveLength(0);
		expect(res.piece).toHaveLength(0);
		expect(res.errors).toHaveLength(3);
		expect(res.errors[1]).toMatch(/unknown piece set/);
	});
});

describe('colorAlpha', () => {
	it('parses hex / rgba and formats back', () => {
		expect(parseCssColor('#abc')).toEqual({ hex: '#aabbcc', alpha: 1 });
		expect(parseCssColor('rgba(20, 85, 30, 0.45)')).toEqual({ hex: '#14551e', alpha: 0.45 });
		expect(parseCssColor('rgb(255 0 0 / 50%)')).toEqual({ hex: '#ff0000', alpha: 0.5 });
		expect(parseCssColor('#ff000080')?.alpha).toBe(0.5);
		expect(parseCssColor('hsl(0 0% 0%)')).toBeNull();
		expect(formatCssColor('#14551e', 0.45)).toBe('rgba(20, 85, 30, 0.45)');
		expect(formatCssColor('#14551e', 1)).toBe('#14551e');
	});
});

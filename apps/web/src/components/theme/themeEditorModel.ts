// Theme-editor model: start a draft from any theme, save it (as new or in
// place) through the themes store, and make it the active theme.
import { cloneBoardTheme, clonePieceTheme, type BoardTheme, type PieceTheme } from '@chess/core/theme';
import { themesActions } from '@/state/themes';
import { replaceSetting, updateSettings } from '@/state/settings';

export type ThemeKind = 'board' | 'piece';

export type ThemeDraft =
	| { kind: 'board'; theme: BoardTheme; /** Not yet stored (clone of a built-in or another theme). */ isNew: boolean }
	| { kind: 'piece'; theme: PieceTheme; isNew: boolean };

/** Built-ins (and explicit clones) become a new custom copy; custom themes are edited in place. */
export function startBoardDraft(source: BoardTheme, clone = source.builtIn): ThemeDraft {
	if (clone) return { kind: 'board', theme: cloneBoardTheme(source, `${source.name} copy`), isNew: true };
	return { kind: 'board', theme: { ...source, texture: { ...source.texture }, highlights: { ...source.highlights }, coords: { ...source.coords } }, isNew: false };
}

export function startPieceDraft(source: PieceTheme, clone = source.builtIn): ThemeDraft {
	if (clone) return { kind: 'piece', theme: clonePieceTheme(source, `${source.name} copy`), isNew: true };
	return { kind: 'piece', theme: { ...source, colors: { white: { ...source.colors.white }, black: { ...source.colors.black } } }, isNew: false };
}

function finalName(name: string, fallback: string): string {
	return name.trim() || fallback;
}

/**
 * Persist a draft and activate it. `asNew` forces a fresh id (Save as new).
 * Activating a piece theme clears per-side colour overrides so the saved colours show.
 */
export async function saveThemeDraft(draft: ThemeDraft, asNew = false): Promise<BoardTheme | PieceTheme> {
	if (draft.kind === 'board') {
		const base = { ...draft.theme, name: finalName(draft.theme.name, 'Custom board'), builtIn: false };
		const theme = asNew && !draft.isNew ? cloneBoardTheme(base, base.name) : base;
		await themesActions.saveBoard(theme);
		updateSettings({ boardThemeId: theme.id });
		return theme;
	}
	const base = { ...draft.theme, name: finalName(draft.theme.name, 'Custom pieces'), builtIn: false };
	const theme = asNew && !draft.isNew ? clonePieceTheme(base, base.name) : base;
	await themesActions.savePiece(theme);
	updateSettings({ pieceThemeId: theme.id });
	replaceSetting('pieceColorOverrides', {});
	return theme;
}

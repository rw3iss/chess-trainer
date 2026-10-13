// Board / piece themes available to the board: built-ins from @chess/core/theme
// plus user themes from ThemesRepository. Resolves the active appearance from
// settings (theme ids + per-side colour overrides). The theme-editor feature
// writes through `themesActions.saveBoard/savePiece/remove`.
import { computed, signal } from '@preact/signals';
import type { Color } from '@chess/core/chess';
import {
	BUILTIN_BOARD_THEMES,
	BUILTIN_PIECE_SETS,
	BUILTIN_PIECE_THEMES,
	DEFAULT_BOARD_THEME_ID,
	DEFAULT_PIECE_THEME_ID,
	type BoardTheme,
	type PieceSetAsset,
	type PieceTheme,
} from '@chess/core/theme';
import { getRepositories } from '@/services/db';
import { defineStore } from './registry';
import { settings } from './settings';

const _customBoard = signal<BoardTheme[]>([]);
const _customPiece = signal<PieceTheme[]>([]);

export const boardThemes = computed(() => [...BUILTIN_BOARD_THEMES, ..._customBoard.value]);
export const pieceThemes = computed(() => [...BUILTIN_PIECE_THEMES, ..._customPiece.value]);
export const pieceSets: readonly PieceSetAsset[] = BUILTIN_PIECE_SETS;

function pick<T extends { id: string }>(list: T[], id: string, fallbackId: string): T | undefined {
	return list.find((t) => t.id === id) ?? list.find((t) => t.id === fallbackId) ?? list[0];
}

export const activeBoardTheme = computed(() => pick(boardThemes.value, settings.value.boardThemeId, DEFAULT_BOARD_THEME_ID));

/** Active piece theme with settings.pieceColorOverrides applied. */
export const activePieceTheme = computed<PieceTheme | undefined>(() => {
	const base = pick(pieceThemes.value, settings.value.pieceThemeId, DEFAULT_PIECE_THEME_ID);
	if (!base) return undefined;
	const ov = settings.value.pieceColorOverrides;
	const sides: Color[] = ['white', 'black'];
	if (!sides.some((c) => ov[c] && Object.keys(ov[c]!).length)) return base;
	return { ...base, colors: { white: { ...base.colors.white, ...ov.white }, black: { ...base.colors.black, ...ov.black } } };
});

export const activePieceSet = computed<PieceSetAsset | undefined>(() => {
	const t = activePieceTheme.value;
	return (t && pieceSets.find((s) => s.id === t.assetId)) ?? pieceSets[0];
});

export const themesActions = {
	async saveBoard(theme: BoardTheme): Promise<void> {
		_customBoard.value = [..._customBoard.value.filter((t) => t.id !== theme.id), theme];
		await getRepositories().themes.putBoard(theme);
	},
	async savePiece(theme: PieceTheme): Promise<void> {
		_customPiece.value = [..._customPiece.value.filter((t) => t.id !== theme.id), theme];
		await getRepositories().themes.putPiece(theme);
	},
	async remove(id: string): Promise<void> {
		_customBoard.value = _customBoard.value.filter((t) => t.id !== id);
		_customPiece.value = _customPiece.value.filter((t) => t.id !== id);
		await getRepositories().themes.remove(id);
	},
};

export async function loadThemes(): Promise<void> {
	const repo = getRepositories().themes;
	const [b, p] = await Promise.all([repo.listBoard(), repo.listPiece()]);
	_customBoard.value = b;
	_customPiece.value = p;
}

defineStore({ name: 'themes', init: loadThemes });

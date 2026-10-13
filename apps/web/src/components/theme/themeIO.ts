// Theme JSON export / import. Import validates with core validateBoardTheme /
// validatePieceTheme, rejects unknown piece assets, and re-ids everything as a
// custom theme so imports never shadow built-ins or clobber existing themes.
import {
	cloneBoardTheme,
	clonePieceTheme,
	findPieceSet,
	validateBoardTheme,
	validatePieceTheme,
	type BoardTheme,
	type PieceTheme,
} from '@chess/core/theme';
import { downloadText as downloadFile } from '@/services/pgn/pgnExport';

export const THEMES_FORMAT = 'chess-themes';
export const THEMES_FORMAT_VERSION = 1;

export interface ThemesBundle {
	format: typeof THEMES_FORMAT;
	version: number;
	board: BoardTheme[];
	piece: PieceTheme[];
}

export interface ThemesImport {
	board: BoardTheme[];
	piece: PieceTheme[];
	errors: string[];
}

export function exportThemes(board: BoardTheme[], piece: PieceTheme[]): string {
	const bundle: ThemesBundle = { format: THEMES_FORMAT, version: THEMES_FORMAT_VERSION, board, piece };
	return JSON.stringify(bundle, null, '\t');
}

function isObj(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Looks like a piece theme (has assetId) vs a board theme (has light/dark). */
function guessKind(x: unknown): 'board' | 'piece' | null {
	if (!isObj(x)) return null;
	if ('assetId' in x) return 'piece';
	if ('light' in x && 'dark' in x) return 'board';
	return null;
}

/** Parse exported JSON: a bundle, a single theme, or an array of themes. */
export function importThemes(text: string): ThemesImport {
	const out: ThemesImport = { board: [], piece: [], errors: [] };
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		out.errors.push('Not valid JSON.');
		return out;
	}
	let items: unknown[];
	if (isObj(data) && (Array.isArray(data.board) || Array.isArray(data.piece))) {
		items = [...((data.board as unknown[]) ?? []), ...((data.piece as unknown[]) ?? [])];
	} else if (Array.isArray(data)) items = data;
	else items = [data];

	items.forEach((item, i) => {
		const label = isObj(item) && typeof item.name === 'string' ? `“${item.name}”` : `#${i + 1}`;
		const kind = guessKind(item);
		if (kind === 'board') {
			if (!validateBoardTheme(item)) return void out.errors.push(`Board theme ${label} is invalid.`);
			out.board.push(cloneBoardTheme(item, item.name));
		} else if (kind === 'piece') {
			if (!validatePieceTheme(item)) return void out.errors.push(`Piece theme ${label} is invalid.`);
			if (!findPieceSet(item.assetId)) return void out.errors.push(`Piece theme ${label} uses an unknown piece set “${item.assetId}”.`);
			out.piece.push(clonePieceTheme(item, item.name));
		} else out.errors.push(`Item ${label} is not a board or piece theme.`);
	});
	if (!items.length) out.errors.push('No themes found.');
	return out;
}

/** Read a user-picked file as text. */
export function readFileText(file: Blob): Promise<string> {
	return file.text();
}

/** Download JSON text (wraps the shared download helper). */
export function downloadText(filename: string, text: string): void {
	downloadFile(filename, text, 'application/json');
}

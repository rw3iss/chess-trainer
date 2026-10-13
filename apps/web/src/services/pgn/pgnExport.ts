// PGN export — SavedGame(s) → PGN text (core treeToPgn) + a browser download helper.
import { treeToPgn } from '@chess/core/chess';
import type { SavedGame } from '@chess/core/game';
import { NOTES_HEADER, TAGS_HEADER, resultToPgn } from './pgnImport';

const pad2 = (n: number) => String(n).padStart(2, '0');

function pgnDate(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

/** One game as PGN. Name → Event; tags/notes → extra headers so import restores them. */
export function savedGameToPgn(game: SavedGame): string {
	const headers: Record<string, string> = {
		Event: game.name,
		Date: pgnDate(game.createdAt),
		Result: resultToPgn(game.result),
	};
	if (game.tags.length) headers[TAGS_HEADER] = game.tags.join(', ');
	if (game.notes?.trim()) headers[NOTES_HEADER] = game.notes.trim().replace(/\s+/g, ' ');
	return treeToPgn(game.tree, headers).trim();
}

/** Many games, blank-line separated (standard multi-game PGN). */
export function savedGamesToPgn(games: readonly SavedGame[]): string {
	return games.map(savedGameToPgn).join('\n\n') + '\n';
}

/** Safe file name stem from a game name. */
export function pgnFileName(stem: string): string {
	const clean = stem.normalize('NFKD').replace(/[^\w\s.-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
	return `${clean || 'game'}.pgn`;
}

/** Trigger a browser download of `text`. */
export function downloadText(fileName: string, text: string, mime = 'application/x-chess-pgn'): void {
	const blob = new Blob([text], { type: `${mime};charset=utf-8` });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

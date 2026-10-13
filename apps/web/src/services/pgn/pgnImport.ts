// PGN import — pure helpers (run inside the PGN worker, or on the main thread as a fallback).
//   parsePgnImports(text)          → ImportedGame[] (one per PGN game; headers → name/tags/result)
//   savedGameFromImport(imp, now)  → SavedGame ready to persist (source.kind = 'import')
import { ROOT_ID, getNode, lineEnd, newId, nodeCount, pgnToGames, type Color, type GameResult, type MoveTree } from '@chess/core/chess';
import type { SavedGame } from '@chess/core/game';

/** Non-standard PGN headers this app writes so export → import round-trips. */
export const TAGS_HEADER = 'Tags';
export const NOTES_HEADER = 'Annotation';

export interface ImportedGame {
	name: string;
	tags: string[];
	notes?: string;
	tree: MoveTree;
	result?: GameResult;
	/** Number of moves (all lines). */
	moveCount: number;
	headers: Record<string, string>;
}

/** Site-generated event names ("Rated Blitz game", "Live Chess") — prefer player names. */
const GENERIC_EVENT = /^(rated|casual|live chess|online|let's play)/i;
const UNKNOWN = new Set(['', '?', '??', '-', '*']);

function known(v: string | undefined): string | undefined {
	const t = v?.trim();
	return t && !UNKNOWN.has(t) && !/^\?+$/.test(t) ? t : undefined;
}

/** PGN `Result` → GameResult. Undecided (`*`) → undefined. */
export function resultFromPgn(value: string | undefined, termination?: string): GameResult | undefined {
	const v = value?.trim();
	const reason = /time|forfeit/i.test(termination ?? '') ? 'timeout' : /abandon/i.test(termination ?? '') ? 'abandoned' : undefined;
	if (v === '1-0' || v === '0-1') {
		const winner: Color = v === '1-0' ? 'white' : 'black';
		return { winner, reason: reason ?? 'resign' };
	}
	if (v === '1/2-1/2' || v === '½-½') return { winner: null, reason: 'draw-agreed' };
	return undefined;
}

/** GameResult → PGN `Result` token. */
export function resultToPgn(result: GameResult | undefined): string {
	if (!result) return '*';
	if (result.winner === 'white') return '1-0';
	if (result.winner === 'black') return '0-1';
	return '1/2-1/2';
}

/** Display name from headers: Event (when not a generic one), else "White – Black", else Opening, else fallback. */
export function nameFromHeaders(h: Record<string, string>, fallback: string): string {
	const white = known(h.White);
	const black = known(h.Black);
	const event = known(h.Event);
	if (event && !GENERIC_EVENT.test(event)) return event;
	if (white || black) return `${white ?? '?'} – ${black ?? '?'}`;
	return known(h.Opening) ?? event ?? fallback;
}

function tagsFromHeaders(h: Record<string, string>): string[] {
	const raw = known(h[TAGS_HEADER]);
	if (!raw) return [];
	return [...new Set(raw.split(',').map((t) => t.trim()).filter(Boolean))];
}

/** Parse a (multi-game) PGN string. Games without a single legal move and no comment are kept (empty game = start position). */
export function parsePgnImports(text: string): ImportedGame[] {
	const games = pgnToGames(text);
	return games.map((g, i) => {
		const imp: ImportedGame = {
			name: nameFromHeaders(g.headers, `Imported game ${i + 1}`),
			tags: tagsFromHeaders(g.headers),
			tree: g.tree,
			moveCount: nodeCount(g.tree) - 1,
			headers: g.headers,
		};
		const notes = known(g.headers[NOTES_HEADER]);
		if (notes) imp.notes = notes;
		const result = resultFromPgn(g.headers.Result, g.headers.Termination);
		if (result) imp.result = result;
		return imp;
	});
}

export function savedGameFromImport(imp: ImportedGame, now: number = Date.now()): SavedGame {
	const game: SavedGame = {
		id: newId(),
		name: imp.name,
		tags: [...imp.tags],
		favorite: false,
		tree: imp.tree,
		finalFen: getNode(imp.tree, lineEnd(imp.tree, ROOT_ID)).fen,
		source: { kind: 'import' },
		mode: 'analysis',
		createdAt: now,
		updatedAt: now,
		revision: 0,
	};
	if (imp.result) game.result = imp.result;
	if (imp.notes) game.notes = imp.notes;
	return game;
}

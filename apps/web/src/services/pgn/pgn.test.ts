import { describe, expect, it } from 'vitest';
import { ROOT_ID, addMove, mainline, setComment, treeFromUci } from '@chess/core/chess';
import type { SavedGame } from '@chess/core/game';
import { nameFromHeaders, parsePgnImports, parsePgn, pgnFileName, resultFromPgn, resultToPgn, savedGameFromImport, savedGameToPgn, savedGamesToPgn } from '@/services/pgn';

function game(over: Partial<SavedGame> = {}): SavedGame {
	const tree = treeFromUci(['e2e4', 'c7c5', 'g1f3', 'd7d6']);
	return {
		id: 'g1',
		name: 'Sicilian practice',
		tags: ['sicilian', 'repertoire'],
		favorite: false,
		tree,
		finalFen: tree.nodes[mainline(tree).at(-1)!.id]!.fen,
		source: { kind: 'new' },
		mode: 'analysis',
		createdAt: Date.UTC(2026, 9, 12),
		updatedAt: Date.UTC(2026, 9, 12),
		revision: 0,
		...over,
	};
}

describe('PGN export → import round-trip', () => {
	it('keeps name, tags, notes, moves, comments and result', () => {
		const g = game({ notes: 'Play d4 next time', result: { winner: 'white', reason: 'resign' } });
		const last = mainline(g.tree).at(-1)!;
		g.tree = setComment(g.tree, last.id, 'Najdorf soon');
		const pgn = savedGameToPgn(g);
		expect(pgn).toContain('[Event "Sicilian practice"]');
		expect(pgn).toContain('[Tags "sicilian, repertoire"]');
		expect(pgn).toContain('1-0');

		const [imp] = parsePgnImports(pgn);
		expect(imp!.name).toBe('Sicilian practice');
		expect(imp!.tags).toEqual(['sicilian', 'repertoire']);
		expect(imp!.notes).toBe('Play d4 next time');
		expect(imp!.result).toEqual({ winner: 'white', reason: 'resign' });
		expect(mainline(imp!.tree).map((n) => n.uci)).toEqual(['e2e4', 'c7c5', 'g1f3', 'd7d6']);
		expect(mainline(imp!.tree).at(-1)!.comment).toBe('Najdorf soon');

		const saved = savedGameFromImport(imp!, 123);
		expect(saved.source.kind).toBe('import');
		expect(saved.finalFen).toBe(g.finalFen);
		expect(saved.createdAt).toBe(123);
		expect(saved.id).not.toBe(g.id);
	});

	it('exports and re-imports many games (variations survive)', async () => {
		const a = game({ id: 'a', name: 'A' });
		const withVar = addMove(treeFromUci(['d2d4', 'd7d5']), ROOT_ID, 'e2e4')!.tree; // 1.d4 (1.e4) d5
		const b = game({ id: 'b', name: 'B', tags: [], tree: withVar, result: { winner: null, reason: 'draw-agreed' } });
		const text = savedGamesToPgn([a, b]);
		const games = await parsePgn(text); // jsdom → main-thread fallback
		expect(games.map((g) => g.name)).toEqual(['A', 'B']);
		expect(games[1]!.result?.winner).toBeNull();
		expect(games[1]!.tags).toEqual([]);
		const root = games[1]!.tree.nodes[ROOT_ID]!;
		expect(root.children.map((id) => games[1]!.tree.nodes[id]!.uci)).toEqual(['d2d4', 'e2e4']);
	});

	it('parses external multi-game PGN with headers and variations', () => {
		const pgn = `[Event "Rated Blitz game"]
[White "Carlsen"]
[Black "Nakamura"]
[Result "0-1"]

1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 0-1

[Event "?"]
[Result "*"]

1. d4 *`;
		const games = parsePgnImports(pgn);
		expect(games).toHaveLength(2);
		expect(games[0]!.name).toBe('Carlsen – Nakamura');
		expect(games[0]!.result?.winner).toBe('black');
		expect(games[0]!.moveCount).toBe(6); // 4 mainline + 2 variation plies
		expect(games[1]!.name).toBe('Imported game 2');
		expect(games[1]!.result).toBeUndefined();
	});
});

describe('PGN helpers', () => {
	it('maps results both ways', () => {
		expect(resultToPgn(undefined)).toBe('*');
		expect(resultToPgn({ winner: 'black', reason: 'checkmate' })).toBe('0-1');
		expect(resultToPgn({ winner: null, reason: 'stalemate' })).toBe('1/2-1/2');
		expect(resultFromPgn('1-0', 'Time forfeit')).toEqual({ winner: 'white', reason: 'timeout' });
		expect(resultFromPgn('*')).toBeUndefined();
	});

	it('names games from headers', () => {
		expect(nameFromHeaders({ Event: 'World Championship' }, 'x')).toBe('World Championship');
		expect(nameFromHeaders({ Event: 'Live Chess', White: 'A' }, 'x')).toBe('A – ?');
		expect(nameFromHeaders({ Opening: 'Italian Game' }, 'x')).toBe('Italian Game');
		expect(nameFromHeaders({}, 'fallback')).toBe('fallback');
	});

	it('makes safe file names', () => {
		expect(pgnFileName('Sicilian: Najdorf / 6.Bg5!')).toBe('Sicilian-Najdorf-6.Bg5.pgn');
		expect(pgnFileName('???')).toBe('game.pgn');
	});
});

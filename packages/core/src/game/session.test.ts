import { describe, expect, it } from 'vitest';
import { addMove, getNode, mainline, nodeCount, treeFromUci } from '../chess/tree.js';
import { ROOT_ID } from '../chess/types.js';
import type { OpeningEntry } from '../openings/types.js';
import {
	createSession,
	currentFen,
	defaultTitle,
	detectResult,
	forkSession,
	linkSessionToSaved,
	savedGameFromSession,
	sessionFromOpening,
	sessionFromSavedGame,
	sessionGoto,
	sessionMove,
	sessionStep,
	sessionToEnd,
	sessionToStart,
	sessionUpdate,
	activeResult,
} from './session.js';
import type { Session } from './types.js';

function play(s: Session, ...ucis: string[]): Session {
	let cur = s;
	ucis.forEach((u, i) => {
		const next = sessionMove(cur, u, 1000 + i);
		if (!next) throw new Error(`illegal ${u}`);
		cur = next;
	});
	return cur;
}

const ENTRY: OpeningEntry = {
	id: 'abc',
	name: 'Ruy Lopez',
	family: 'Ruy Lopez',
	eco: 'C60',
	uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'],
	san: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
	plies: 5,
	perspective: 'white',
	epd: '',
	source: 'test',
};

describe('session', () => {
	it('createSession defaults', () => {
		const s = createSession({ now: 5, id: 'x' });
		expect(s).toMatchObject({
			id: 'x',
			cursor: ROOT_ID,
			orientation: 'white',
			mode: 'analysis',
			source: { kind: 'new' },
			playback: { speed: 'medium', playing: false },
			dirty: false,
			createdAt: 5,
			updatedAt: 5,
			revision: 0,
			title: 'Analysis',
		});
	});

	it('sessionFromOpening', () => {
		const s = sessionFromOpening({ ...ENTRY, perspective: 'black' }, { now: 1 });
		expect(s.title).toBe('Ruy Lopez');
		expect(s.cursor).toBe(ROOT_ID);
		expect(s.orientation).toBe('black');
		expect(s.source).toEqual({ kind: 'opening', openingId: 'abc' });
		expect(mainline(s.tree).map((n) => n.san)).toEqual(ENTRY.san);
	});

	it('sessionMove adds at cursor, reuses existing, marks dirty, bumps revision', () => {
		let s = createSession({ now: 0 });
		s = play(s, 'e2e4', 'e7e5');
		expect(s.dirty).toBe(true);
		expect(s.revision).toBe(2);
		expect(getNode(s.tree, s.cursor).san).toBe('e5');
		expect(sessionMove(s, 'e2e4', 5)).toBeNull();
		const back = sessionStep(s, -1);
		const clean = { ...back, dirty: false };
		const again = sessionMove(clean, 'e7e5', 9)!;
		expect(again.tree).toBe(clean.tree);
		expect(again.dirty).toBe(false);
		expect(again.cursor).toBe(s.cursor);
		const variation = sessionMove(clean, 'c7c5', 9)!;
		expect(getNode(variation.tree, getNode(variation.tree, ROOT_ID).children[0]!).children).toHaveLength(2);
		expect(variation.dirty).toBe(true);
	});

	it('sessionMove detects checkmate result', () => {
		const s = play(createSession({ mode: 'local-pvp' }), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
		expect(s.result).toEqual({ winner: 'black', reason: 'checkmate' });
	});

	it('manual result sticks in games but not analysis', () => {
		const base = createSession({ mode: 'local-pvp' });
		const resigned = { ...base, result: { winner: 'white' as const, reason: 'resign' as const } };
		expect(sessionMove(resigned, 'e2e4')!.result?.reason).toBe('resign');
		expect(sessionMove({ ...resigned, mode: 'analysis' }, 'e2e4')!.result).toBeUndefined();
	});

	it('navigation: step / goto / start / end', () => {
		let s = play(createSession(), 'e2e4', 'e7e5', 'g1f3');
		const end = s.cursor;
		s = sessionStep(s, -2);
		expect(getNode(s.tree, s.cursor).san).toBe('e4');
		s = sessionStep(s, -10);
		expect(s.cursor).toBe(ROOT_ID);
		s = sessionStep(s, 10);
		expect(s.cursor).toBe(end);
		expect(sessionToStart(s).cursor).toBe(ROOT_ID);
		expect(sessionToEnd(sessionToStart(s)).cursor).toBe(end);
		expect(sessionGoto(s, end)).toBe(s);
		expect(() => sessionGoto(s, 'nope')).toThrow();
		expect(currentFen(s)).toBe(getNode(s.tree, end).fen);
	});

	it('forkSession truncates and links back', () => {
		const s = play(createSession({ id: 'p', title: 'Game' }), 'e2e4', 'e7e5', 'g1f3');
		const atE5 = getNode(s.tree, s.cursor).parentId!;
		const withBot: Session = {
			...s,
			mode: 'bot',
			bot: { engineId: 'sf-lite', targetElo: 1500, color: 'black', think: { preset: 'fast' }, allowTakebacks: true },
			savedGameId: 'g1',
		};
		const f = forkSession(withBot, atE5, 77);
		expect(f.id).not.toBe('p');
		expect(f.cursor).toBe(atE5);
		expect(nodeCount(f.tree)).toBe(3);
		expect(f.source).toEqual({ kind: 'fork', parentSessionId: 'p', atNodeId: atE5 });
		expect(f.mode).toBe('analysis');
		expect(f.bot).toBeUndefined();
		expect(f.clock).toBeUndefined();
		expect(f.savedGameId).toBeUndefined();
		expect(f.title).toBe('Game (fork)');
		expect(f.createdAt).toBe(77);
		expect(nodeCount(s.tree)).toBe(4);
	});

	it('sessionUpdate bumps updatedAt + revision', () => {
		const s = createSession({ now: 0 });
		const u = sessionUpdate(s, { title: 'X' }, 50);
		expect(u).toMatchObject({ title: 'X', updatedAt: 50, revision: 1 });
		expect(s.title).toBe('Analysis');
	});

	it('save: new, overwrite, save-as-new', () => {
		let s = play(createSession({ id: 's' }), 'e2e4', 'e7e5');
		const g1 = savedGameFromSession(s, { name: 'First', asNew: false, now: 100 });
		expect(g1).toMatchObject({ name: 'First', tags: [], favorite: false, createdAt: 100, updatedAt: 100, revision: 0 });
		expect(g1.parentGameId).toBeUndefined();
		expect(g1.finalFen).toBe(getNode(s.tree, s.cursor).fen);
		s = linkSessionToSaved(s, g1);
		expect(s).toMatchObject({ savedGameId: g1.id, dirty: false, title: 'First' });

		s = play(s, 'g1f3');
		const fav = { ...g1, favorite: true };
		const g2 = savedGameFromSession(s, { name: 'First v2', tags: ['a'], asNew: false, existing: fav, now: 200 });
		expect(g2).toMatchObject({ id: g1.id, createdAt: 100, favorite: true, revision: 1, updatedAt: 200, name: 'First v2', tags: ['a'] });
		expect(mainline(g2.tree)).toHaveLength(3);

		const g3 = savedGameFromSession(s, { name: 'Copy', asNew: true, existing: fav, now: 300 });
		expect(g3.id).not.toBe(g1.id);
		expect(g3.parentGameId).toBe(g1.id);
		expect(g3).toMatchObject({ favorite: false, createdAt: 300, revision: 0 });
	});

	it('sessionFromSavedGame opens at the line end', () => {
		const tree = treeFromUci(['d2d4', 'd7d5', 'c2c4']);
		const game = savedGameFromSession(createSession({ tree }), { name: 'QG', asNew: true, now: 1 });
		const s = sessionFromSavedGame(game, 9);
		expect(s.savedGameId).toBe(game.id);
		expect(s.source).toEqual({ kind: 'saved', savedGameId: game.id });
		expect(getNode(s.tree, s.cursor).san).toBe('c4');
		expect(s.title).toBe('QG');
		expect(s.dirty).toBe(false);
	});

	it('detectResult', () => {
		expect(detectResult('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toEqual({ winner: null, reason: 'stalemate' });
		expect(detectResult('8/8/4k3/8/8/2K5/8/8 w - - 0 1')).toEqual({ winner: null, reason: 'insufficient' });
		expect(detectResult('8/8/4k3/8/8/2KR4/8/8 w - - 100 80')).toEqual({ winner: null, reason: 'fifty-move' });
		const t = treeFromUci(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
		const fens = [getNode(t, ROOT_ID).fen, ...mainline(t).map((n) => n.fen)];
		expect(detectResult(fens[fens.length - 1]!, fens)).toEqual({ winner: null, reason: 'repetition' });
		expect(detectResult(fens[0]!)).toBeUndefined();
	});

	it('defaultTitle', () => {
		let s = play(createSession(), 'e2e4', 'e7e5', 'g1f3');
		expect(defaultTitle(s)).toBe('Analysis — 1.e4 e5 2.Nf3');
		s = { ...s, mode: 'bot', bot: { engineId: 'sf-lite', targetElo: 1500, color: 'black', think: { preset: 'fast' }, allowTakebacks: false } };
		expect(defaultTitle(s)).toBe('Bot 1500 — 1.e4 e5 2.Nf3');
		const r = addMove(treeFromUci([], 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'), ROOT_ID, 'e7e5')!;
		expect(defaultTitle({ mode: 'analysis', tree: r.tree })).toBe('Analysis — 1...e5');
	});
});

describe('result tied to the final position', () => {
	// Fool's mate: 1.f3 e5 2.g4 Qh4#
	const mate = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
	const play = (s: Session, ucis: string[]) => ucis.reduce((acc, u) => sessionMove(acc, u)!, s);

	it('hides the result after stepping back, and a new move continues the game', () => {
		let s = play(createSession({ mode: 'bot' }), mate);
		expect(activeResult(s)?.reason).toBe('checkmate');
		s = sessionStep(s, -1);
		expect(activeResult(s)).toBeUndefined();
		s = sessionMove(s, 'b8c6')!; // a different 2nd move for black
		expect(s.result).toBeUndefined();
		expect(s.resultNodeId).toBeUndefined();
		// The mate line is still in the tree; going there shows the result again only via a new detection.
	});

	it('keeps a manual result only on the node it was set on', () => {
		let s = play(createSession({ mode: 'local-pvp' }), ['e2e4', 'e7e5']);
		s = sessionUpdate(s, { result: { winner: 'white', reason: 'resign' } });
		expect(s.resultNodeId).toBe(s.cursor);
		expect(activeResult(s)?.reason).toBe('resign');
		const back = sessionStep(s, -1);
		expect(activeResult(back)).toBeUndefined();
		const cleared = sessionUpdate(s, { result: undefined });
		expect(cleared.result).toBeUndefined();
		expect(cleared.resultNodeId).toBeUndefined();
	});

	it('applies a legacy result (no resultNodeId) on leaves only', () => {
		const s = play(createSession({ mode: 'bot' }), ['e2e4', 'e7e5']);
		const legacy: Session = { ...s, result: { winner: 'black', reason: 'timeout' } };
		expect(activeResult(legacy)).toBeDefined();
		expect(activeResult(sessionStep(legacy, -1))).toBeUndefined();
	});
});

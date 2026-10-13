import { describe, expect, it } from 'vitest';
import { INITIAL_FEN, ROOT_ID } from '@chess/core/chess';
import { createSession } from '@chess/core/game';
import { mainlineUcis, parseRoomRef, roomLink, syncTree, localClock } from '../roomSession';

describe('roomSession', () => {
	it('appends missing moves and moves the cursor when it was at the end', () => {
		const s = createSession();
		const a = syncTree(s, INITIAL_FEN, ['e2e4', 'e7e5']);
		expect(mainlineUcis({ tree: a.tree })).toEqual(['e2e4', 'e7e5']);
		expect(a.tree.nodes[a.cursor]!.uci).toBe('e7e5');
		const b = syncTree(a, INITIAL_FEN, ['e2e4', 'e7e5', 'g1f3']);
		expect(b.tree.nodes[b.cursor]!.uci).toBe('g1f3');
	});

	it('keeps the cursor when the user is browsing earlier moves', () => {
		const a = syncTree(createSession(), INITIAL_FEN, ['e2e4', 'e7e5']);
		const browsing = { ...a, cursor: ROOT_ID };
		const b = syncTree(browsing, INITIAL_FEN, ['e2e4', 'e7e5', 'g1f3']);
		expect(b.cursor).toBe(ROOT_ID);
		expect(mainlineUcis({ tree: b.tree })).toHaveLength(3);
	});

	it('returns the same object when nothing changed and rebuilds on divergence', () => {
		const a = syncTree(createSession(), INITIAL_FEN, ['e2e4']);
		expect(syncTree(a, INITIAL_FEN, ['e2e4'])).toBe(a);
		const b = syncTree(a, INITIAL_FEN, ['d2d4', 'd7d5']);
		expect(mainlineUcis({ tree: b.tree })).toEqual(['d2d4', 'd7d5']);
	});

	it('shifts a running clock into local time', () => {
		const clock = { config: { initialMs: 1000, incrementMs: 0 }, remaining: { white: 1000, black: 1000 }, running: 'white' as const, lastStartedAt: 100, flagged: null, toMove: 'white' as const };
		expect(localClock(clock, 50)!.lastStartedAt).toBe(150);
		expect(localClock(clock, 0)).toBe(clock);
		expect(localClock(undefined, 5)).toBeUndefined();
	});

	it('parses room links and codes', () => {
		expect(parseRoomRef('https://x.app/play/AbC_12-x')).toBe('AbC_12-x');
		expect(parseRoomRef('  AbC_12-x ')).toBe('AbC_12-x');
		expect(parseRoomRef('/play/new')).toBeNull();
		expect(parseRoomRef('bad id!')).toBeNull();
		expect(roomLink('abc', 'https://x.app')).toBe('https://x.app/play/abc');
	});
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROOT_ID, getNode } from '@chess/core/chess';
import type { OpeningEntry } from '@chess/core/openings';
import {
	AUTOSAVE_DEBOUNCE_MS,
	activeId,
	activeSession,
	flushSessions,
	onSessionEvent,
	openSessions,
	resetSessionsState,
	restoreSessions,
	sessionsActions,
} from '@/state/sessions';
import { freshRepositories, sleep } from './testDb';

const SICILIAN: OpeningEntry = {
	id: 'sic',
	name: 'Sicilian Defense',
	family: 'Sicilian Defense',
	eco: 'B20',
	uci: ['e2e4', 'c7c5'],
	san: ['e4', 'c5'],
	plies: 2,
	perspective: 'black',
	epd: 'x',
	source: 'test',
};

describe('sessions store', () => {
	let repos: ReturnType<typeof freshRepositories>['repos'];

	beforeEach(() => {
		resetSessionsState();
		repos = freshRepositories().repos;
	});
	afterEach(() => resetSessionsState());

	it('opens a new session and makes it active', () => {
		const s = sessionsActions.newSession();
		expect(activeId.value).toBe(s.id);
		expect(openSessions.value).toHaveLength(1);
	});

	it('applies moves through core reducers and keeps a live auto title', () => {
		sessionsActions.newSession();
		expect(sessionsActions.move('e2e4')).not.toBeNull();
		expect(sessionsActions.move('e7e5')).not.toBeNull();
		expect(sessionsActions.move('e1e5')).toBeNull(); // illegal
		const s = activeSession.value!;
		expect(getNode(s.tree, s.cursor).san).toBe('e5');
		expect(s.title).toContain('1.e4 e5');
		sessionsActions.rename('My line');
		sessionsActions.move('g1f3');
		expect(activeSession.value!.title).toBe('My line');
	});

	it('steps, jumps to start/end and flips', () => {
		sessionsActions.newSession();
		['e2e4', 'e7e5', 'g1f3'].forEach((m) => sessionsActions.move(m));
		sessionsActions.toStart();
		expect(activeSession.value!.cursor).toBe(ROOT_ID);
		sessionsActions.step(2);
		expect(getNode(activeSession.value!.tree, activeSession.value!.cursor).san).toBe('e5');
		sessionsActions.toEnd();
		expect(getNode(activeSession.value!.tree, activeSession.value!.cursor).san).toBe('Nf3');
		sessionsActions.flip();
		expect(activeSession.value!.orientation).toBe('black');
	});

	it('forks at a node into a new active session placed after the source', () => {
		const a = sessionsActions.newSession();
		['e2e4', 'e7e5', 'g1f3'].forEach((m) => sessionsActions.move(m));
		const e5 = Object.values(activeSession.value!.tree.nodes).find((n) => n.san === 'e5')!;
		const f = sessionsActions.fork(a.id, e5.id)!;
		expect(activeId.value).toBe(f.id);
		expect(f.source).toMatchObject({ kind: 'fork', parentSessionId: a.id, atNodeId: e5.id });
		expect(Object.keys(f.tree.nodes)).toHaveLength(3);
		expect(openSessions.value.map((s) => s.id)).toEqual([a.id, f.id]);
	});

	it('deletes a subtree and moves the cursor out of it; promotes variations', () => {
		sessionsActions.newSession();
		sessionsActions.move('e2e4');
		const e4 = activeSession.value!.cursor;
		sessionsActions.move('e7e5');
		sessionsActions.goto(e4);
		sessionsActions.move('c7c5'); // variation
		const c5 = activeSession.value!.cursor;
		sessionsActions.promoteVariation(c5);
		expect(getNode(activeSession.value!.tree, e4).children[0]).toBe(c5);
		sessionsActions.deleteFrom(c5);
		expect(activeSession.value!.cursor).toBe(e4);
		expect(activeSession.value!.tree.nodes[c5]).toBeUndefined();
	});

	it('reuses an untouched opening session when loading another opening', () => {
		const first = sessionsActions.fromOpening(SICILIAN);
		const second = sessionsActions.fromOpening({ ...SICILIAN, id: 'x', name: 'French', uci: ['e2e4', 'e7e6'] }, { reuseUntouched: true });
		expect(second.id).toBe(first.id);
		expect(openSessions.value).toHaveLength(1);
		sessionsActions.step(1);
		expect(sessionsActions.move('d7d5')).not.toBeNull(); // now dirty
		const third = sessionsActions.fromOpening(SICILIAN, { reuseUntouched: true });
		expect(third.id).not.toBe(first.id);
	});

	it('closing the active session activates its neighbour', () => {
		const a = sessionsActions.newSession();
		const b = sessionsActions.newSession();
		const c = sessionsActions.newSession();
		sessionsActions.setActive(b.id);
		sessionsActions.close(b.id);
		expect(activeId.value).toBe(c.id);
		sessionsActions.close(c.id);
		expect(activeId.value).toBe(a.id);
		sessionsActions.close(a.id);
		expect(activeId.value).toBeNull();
	});

	it('emits user-action for manual navigation but not for silent steps', () => {
		const events: string[] = [];
		const off = onSessionEvent((e) => e.type === 'user-action' && events.push(e.action));
		sessionsActions.newSession();
		sessionsActions.move('e2e4');
		sessionsActions.step(-1);
		sessionsActions.step(1, undefined, { silent: true });
		off();
		expect(events).toEqual(['move', 'step']);
	});

	it('autosaves debounced (300 ms) and restores sessions, order and active id', async () => {
		const a = sessionsActions.newSession();
		sessionsActions.move('e2e4');
		const b = sessionsActions.newSession();
		sessionsActions.move('d2d4');
		sessionsActions.setActive(a.id);

		// Nothing written synchronously…
		expect(await repos.sessions.list()).toHaveLength(0);
		// …written after the debounce window.
		await sleep(AUTOSAVE_DEBOUNCE_MS + 80);
		await flushSessions();
		expect(await repos.sessions.list()).toHaveLength(2);

		resetSessionsState();
		expect(openSessions.value).toHaveLength(0);
		await restoreSessions();
		expect(openSessions.value.map((s) => s.id)).toEqual([a.id, b.id]);
		expect(activeId.value).toBe(a.id);
		expect(getNode(activeSession.value!.tree, activeSession.value!.cursor).san).toBe('e4');
	});

	it('removes closed sessions from storage', async () => {
		const a = sessionsActions.newSession();
		sessionsActions.newSession();
		await flushSessions();
		sessionsActions.close(a.id);
		await flushSessions();
		const stored = await repos.sessions.list();
		expect(stored.map((s) => s.id)).not.toContain(a.id);
		expect((await repos.sessions.getMeta())?.order).toHaveLength(1);
	});
});

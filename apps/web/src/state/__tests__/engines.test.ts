import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_ID, engineMeta, getNode, type EngineAdapter, type EngineInfo, type EnginePosition, type PlayOptions, type PlayResult } from '@chess/core';
import { EngineAbortError, EngineAssetStore, EngineRegistry } from '@/services/engine';
import {
	analysis,
	analysisActions,
	analysisPrefs,
	botActions,
	botTip,
	engineEntries,
	initEngines,
	isBotThinking,
	nextTip,
	pickBookMove,
	resetEnginesState,
	setEngineRegistry,
	ENGINE_PREFS_KEY,
} from '@/state/engines';
import { activeSession, getSession, resetSessionsState, sessionsActions } from '@/state/sessions';
import { freshRepositories, sleep } from './testDb';

interface PendingPlay {
	pos: EnginePosition;
	opts: PlayOptions;
	resolve: (r: PlayResult) => void;
}

function fakeAdapter() {
	const plays: PendingPlay[] = [];
	const analyses: { pos: EnginePosition; onInfo: (i: EngineInfo) => void; stopped: boolean }[] = [];
	const rejects: ((e: Error) => void)[] = [];
	const adapter = {
		meta: engineMeta('sf-lite')!,
		capabilities: { limitStrength: true, multiPv: true, analysis: true, ponder: false },
		status: 'ready',
		init: async () => undefined,
		newGame: () => undefined,
		play: (pos: EnginePosition, opts: PlayOptions) =>
			new Promise<PlayResult>((resolve, reject) => {
				plays.push({ pos, opts, resolve });
				rejects.push(reject);
			}),
		analyze: (pos: EnginePosition, _o: unknown, onInfo: (i: EngineInfo) => void) => {
			const a = { pos, onInfo, stopped: false };
			analyses.push(a);
			return () => {
				a.stopped = true;
			};
		},
		stop: vi.fn(() => {
			for (const r of rejects.splice(0)) r(new EngineAbortError());
			for (const a of analyses) a.stopped = true;
		}),
		dispose: () => undefined,
	} satisfies EngineAdapter;
	return { adapter, plays, analyses };
}

const tick = (ms = 0) => sleep(ms);

/** Waits until fn() is truthy (or fails after ~1 s). */
async function until(fn: () => unknown, ms = 1000): Promise<void> {
	await vi.waitFor(() => {
		if (!fn()) throw new Error('not yet');
	}, { timeout: ms, interval: 5 });
}

describe('engines store', () => {
	let fake: ReturnType<typeof fakeAdapter>;
	let repos: ReturnType<typeof freshRepositories>['repos'];

	beforeEach(async () => {
		resetSessionsState();
		resetEnginesState();
		repos = freshRepositories().repos;
		fake = fakeAdapter();
		setEngineRegistry(
			new EngineRegistry({
				store: new EngineAssetStore('t', fetch, undefined),
				loadManifest: async () => null,
				factories: { 'sf-lite': () => fake.adapter },
				idleDisposeMs: 0,
			}),
		);
		await initEngines();
	});
	afterEach(() => {
		resetEnginesState();
		resetSessionsState();
	});

	it('lists engines with availability (fake sf-lite available, others with reasons)', async () => {
		await until(() => engineEntries.value.length > 0);
		const lite = engineEntries.value.find((e) => e.meta.id === 'sf-lite')!;
		expect(lite.availability.available).toBe(true);
		const remote = engineEntries.value.find((e) => e.meta.id === 'sf-native')!;
		expect(remote.availability).toMatchObject({ available: false, reason: 'needs-server' });
	});

	it('analysis: toggles on, analyses the active position, persists prefs, clears when off', async () => {
		const s = sessionsActions.newSession();
		sessionsActions.move('e2e4', s.id);
		analysisActions.setMultiPv(2);
		analysisActions.setEnabled(true);
		await until(() => fake.analyses.length > 0);
		const a = fake.analyses[fake.analyses.length - 1]!;
		expect(a.pos.moves).toEqual(['e2e4']);
		a.onInfo({ depth: 12, multipv: 1, score: { cp: -30 }, pv: ['e7e5', 'g1f3'], nodes: 1000, nps: 5000 });
		await until(() => analysis.value?.lines.length === 1);
		// Black to move, -30 → White POV +30.
		expect(analysis.value!.lines[0]!.score).toEqual({ cp: 30 });
		expect(analysis.value!.depth).toBe(12);
		expect(await repos.kv.get(ENGINE_PREFS_KEY)).toMatchObject({ enabled: true, multiPv: 2 });

		analysisActions.setEnabled(false);
		expect(analysis.value).toBeNull();
		expect(a.stopped).toBe(true);
		expect(analysisPrefs.value.enabled).toBe(false);
	});

	it('bot: attaches from the cursor, replies on its turn, and the tip follows', async () => {
		const s = sessionsActions.newSession();
		sessionsActions.move('e2e4', s.id);
		sessionsActions.move('e7e5', s.id);
		botActions.attach({ engineId: 'sf-lite', targetElo: 1500, color: 'white', think: { preset: 'fast' }, allowTakebacks: true, userColor: 'black', clock: { initialMs: 300_000, incrementMs: 3000 } });
		const attached = getSession(s.id)!;
		expect(attached.mode).toBe('bot');
		expect(attached.bot).toMatchObject({ color: 'white', targetElo: 1500 });
		expect(attached.orientation).toBe('black');
		expect(attached.clock?.config.initialMs).toBe(300_000);
		await until(() => fake.plays.length === 1);
		expect(fake.plays[0]!.pos.moves).toEqual(['e2e4', 'e7e5']);
		expect(fake.plays[0]!.opts).toEqual({ think: { preset: 'fast' }, targetElo: 1500 });
		expect(isBotThinking(s.id)).toBe(true);
		fake.plays[0]!.resolve({ uci: 'g1f3' });
		await until(() => getNode(getSession(s.id)!.tree, getSession(s.id)!.cursor).uci === 'g1f3');
		expect(botTip(s.id)).toBe(getSession(s.id)!.cursor);
		expect(isBotThinking(s.id)).toBe(false);
		// User replies → bot thinks again.
		sessionsActions.move('b8c6', s.id);
		await until(() => fake.plays.length === 2);
	});

	it('bot: does not move while the user browses back in history', async () => {
		const s = sessionsActions.newSession();
		sessionsActions.move('e2e4', s.id);
		sessionsActions.move('e7e5', s.id);
		sessionsActions.move('g1f3', s.id);
		// Attach as White with Black (bot) to move.
		botActions.attach({ engineId: 'sf-lite', targetElo: 1500, color: 'black', think: { preset: 'fast' }, allowTakebacks: false, userColor: 'white' });
		await until(() => fake.plays.length === 1);
		// User steps back two plies: Black to move again at an older position, but not at the tip.
		sessionsActions.step(-2, s.id);
		await tick(20);
		expect(fake.adapter.stop).toHaveBeenCalled();
		expect(fake.plays.length).toBe(1); // no new request
		expect(isBotThinking(s.id)).toBe(false);
		// Back to the tip → the bot thinks again.
		sessionsActions.toEnd(s.id);
		await until(() => fake.plays.length === 2);
		expect(fake.plays[1]!.pos.moves).toEqual(['e2e4', 'e7e5', 'g1f3']);
	});

	it('bot: a move mid-line from the attach point becomes a variation', async () => {
		const s = sessionsActions.newSession();
		for (const m of ['e2e4', 'e7e5', 'g1f3', 'b8c6']) sessionsActions.move(m, s.id);
		sessionsActions.step(-2, s.id); // cursor after 1…e5 (White to move), line continues
		botActions.attach({ engineId: 'sf-lite', targetElo: 1500, color: 'white', think: { preset: 'fast' }, allowTakebacks: false, userColor: 'black' });
		await until(() => fake.plays.length === 1);
		fake.plays[0]!.resolve({ uci: 'f1c4' });
		await until(() => getNode(getSession(s.id)!.tree, getSession(s.id)!.cursor).uci === 'f1c4');
		const cur = getSession(s.id)!;
		const parent = getNode(cur.tree, getNode(cur.tree, cur.cursor).parentId!);
		expect(parent.children.length).toBe(2); // g1f3 (main) + f1c4 (variation)
	});

	it('bot: takeback undoes the bot reply and the user move', async () => {
		const s = sessionsActions.newSession();
		botActions.attach({ engineId: 'sf-lite', targetElo: 1500, color: 'black', think: { preset: 'fast' }, allowTakebacks: true, userColor: 'white' });
		sessionsActions.move('e2e4', s.id);
		await until(() => fake.plays.length === 1);
		fake.plays[0]!.resolve({ uci: 'e7e5' });
		await until(() => getSession(s.id)!.tree.nodes[getSession(s.id)!.cursor]!.uci === 'e7e5');
		expect(botActions.takebackPlies(getSession(s.id)!)).toBe(2);
		expect(botActions.takeback(s.id)).toBe(true);
		const back = getSession(s.id)!;
		expect(back.cursor).toBe(ROOT_ID);
		await tick(20);
		expect(fake.plays.length).toBe(1); // White (user) to move → bot waits
	});

	it('bot: detach returns to analysis and stops the bot', async () => {
		const s = sessionsActions.newSession();
		sessionsActions.move('e2e4', s.id);
		botActions.attach({ engineId: 'sf-lite', targetElo: 1200, color: 'black', think: { preset: 'fast' }, allowTakebacks: false, userColor: 'white' });
		await until(() => fake.plays.length === 1);
		botActions.detach(s.id);
		const d = getSession(s.id)!;
		expect(d.mode).toBe('analysis');
		expect(d.bot).toBeUndefined();
		expect(d.clock).toBeUndefined();
		expect(isBotThinking(s.id)).toBe(false);
		expect(botTip(s.id)).toBeUndefined();
		// Stale result never lands.
		fake.plays[0]!.resolve({ uci: 'e7e5' });
		await tick(20);
		expect(getNode(d.tree, getSession(s.id)!.cursor).uci).toBe('e2e4');
		expect(activeSession.value?.id).toBe(s.id);
	});
});

describe('engines helpers', () => {
	it('pickBookMove weights by popularity', () => {
		const conts = [
			{ uci: 'e2e4', popularity: 0.6 },
			{ uci: 'd2d4', popularity: 0.4 },
		];
		expect(pickBookMove(conts, () => 0.1)).toBe('e2e4');
		expect(pickBookMove(conts, () => 0.9)).toBe('d2d4');
		expect(pickBookMove([], () => 0.5)).toBeNull();
	});

	it('nextTip follows moves at the tip and leaves, not browsing', () => {
		const s0 = sessionsActions.newSession();
		sessionsActions.move('e2e4', s0.id);
		sessionsActions.move('e7e5', s0.id);
		const s = getSession(s0.id)!;
		const tip = s.cursor;
		const back = sessionsActions.step(-1, s.id)!;
		expect(nextTip(back, tip)).toBe(tip);
		const fwd = sessionsActions.toEnd(s.id)!;
		expect(nextTip(fwd, tip)).toBe(tip);
		resetSessionsState();
	});
});

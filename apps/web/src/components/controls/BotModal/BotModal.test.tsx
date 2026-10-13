import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { engineMeta, INITIAL_FEN, type EngineAdapter } from '@chess/core';
import { createSession } from '@chess/core/game';
import { EngineAssetStore, EngineRegistry } from '@/services/engine';
import { commands } from '@/services/commands';
import { engineEntries, initEngines, resetEnginesState, setEngineRegistry } from '@/state/engines';
import { getSession, resetSessionsState, sessionsActions } from '@/state/sessions';
import { freshRepositories } from '@/state/__tests__/testDb';
import { BotModal } from './BotModal';
import { initialForm, presetEnabled, toSetup, ELO_PRESETS } from './botForm';
import { botModalOpen } from './BotModalHost';
import { registerEngineFeature } from '@/components/engine/register';

const idle: EngineAdapter = {
	meta: engineMeta('sf-lite')!,
	capabilities: { limitStrength: true, multiPv: true, analysis: true, ponder: false },
	status: 'ready',
	init: async () => undefined,
	newGame: () => undefined,
	play: () => new Promise(() => undefined),
	analyze: () => () => undefined,
	stop: () => undefined,
	dispose: () => undefined,
};

async function setup() {
	resetSessionsState();
	resetEnginesState();
	freshRepositories();
	setEngineRegistry(new EngineRegistry({ store: new EngineAssetStore('t', fetch, undefined), loadManifest: async () => null, factories: { 'sf-lite': () => idle }, idleDisposeMs: 0 }));
	await initEngines();
	await waitFor(() => expect(engineEntries.value.length).toBeGreaterThan(0));
}

describe('BotModal', () => {
	beforeEach(setup);
	afterEach(() => {
		resetEnginesState();
		resetSessionsState();
	});

	it('lists available engines and explains unavailable ones', () => {
		const s = sessionsActions.newSession();
		render(<BotModal open onClose={() => undefined} session={s} />);
		expect(screen.getByRole('dialog', { name: 'Play with a bot' })).toBeTruthy();
		const select = screen.getByLabelText('Engine') as HTMLSelectElement;
		expect([...select.options].map((o) => o.value)).toEqual(['sf-lite']);
		expect(screen.getByText(/not available/)).toBeTruthy();
		expect(screen.getByText('Stockfish 19 (server)')).toBeTruthy();
		expect(screen.getAllByText('Needs the server').length).toBeGreaterThan(0);
	});

	it('Club preset + Black + Start attaches a 1500 bot playing White from the cursor', () => {
		const s = sessionsActions.newSession();
		sessionsActions.move('e2e4', s.id);
		sessionsActions.move('e7e5', s.id);
		let closed = false;
		render(<BotModal open onClose={() => (closed = true)} session={getSession(s.id)} />);
		fireEvent.click(screen.getByRole('button', { name: /Club/ }));
		expect((screen.getByLabelText('Target Elo') as HTMLInputElement).value).toBe('1500');
		fireEvent.click(screen.getByRole('radio', { name: 'Black' }));
		fireEvent.click(screen.getByRole('button', { name: 'Start' }));
		const after = getSession(s.id)!;
		expect(after.mode).toBe('bot');
		expect(after.bot).toMatchObject({ engineId: 'sf-lite', targetElo: 1500, color: 'white', allowTakebacks: true });
		expect(after.orientation).toBe('black');
		expect(closed).toBe(true);
	});

	it('edits a running bot game and can detach', () => {
		const s = sessionsActions.newSession();
		sessionsActions.update({ mode: 'bot', bot: { engineId: 'sf-lite', targetElo: 1200, color: 'black', think: { preset: 'fast' }, allowTakebacks: false } }, s.id);
		render(<BotModal open onClose={() => undefined} session={getSession(s.id)} />);
		expect(screen.getByRole('dialog', { name: 'Bot game' })).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Detach' }));
		expect(getSession(s.id)!.mode).toBe('analysis');
	});

	it("the 'openBot' command opens the modal once the feature is registered", async () => {
		const off = registerEngineFeature();
		sessionsActions.newSession();
		commands.dispatch('openBot');
		expect(botModalOpen.value).toBe(true);
		await waitFor(() => expect(screen.getByRole('dialog', { name: 'Play with a bot' })).toBeTruthy());
		off();
		botModalOpen.value = false;
	});
});

describe('botForm', () => {
	it('defaults to the side to move, clamps Elo to the engine range, builds clock config', () => {
		const s = createSession({ fen: INITIAL_FEN });
		const f = initialForm(s, { engineId: 'maia', elo: 600, think: { preset: 'normal' } }, (id) => engineMeta(id));
		expect(f.userColor).toBe('white');
		expect(f.elo).toBe(1100);
		const built = toSetup({ ...f, clockOn: true, clockPreset: '3+2', think: 'custom', customMs: 5 });
		expect(built.clock).toEqual({ initialMs: 180_000, incrementMs: 2000 });
		expect(built.think).toEqual({ movetimeMs: 20 });
		expect(presetEnabled(ELO_PRESETS[0]!, [1100, 2000])).toBe(false);
		expect(presetEnabled(ELO_PRESETS[5]!, [1100, 2000])).toBe(true);
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { INITIAL_FEN } from '@chess/core/chess';
import { createSession, sessionMove } from '@chess/core/game';
import { freshRepositories } from '@/state/__tests__/testDb';
import { activeSession, openSessions, resetSessionsState, sessionsActions } from '@/state/sessions';
import { DEFAULT_SETTINGS, resetSettings } from '@/state/settings';
import { commands } from '@/services/commands';
import { NewGameModal } from '../NewGameModal';
import { buildNewGamePlan, initialNewGameForm, validateNewGame } from '../newGameForm';
import { autoFlipOrientation } from '../pvpController';
import { agreeDraw, resignSession } from '../GameEndDialogs';

const FEN_B = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('newGameForm', () => {
	it('validates FEN / current-position starts', () => {
		const f = initialNewGameForm(DEFAULT_SETTINGS.clock, 'local-pvp');
		expect(validateNewGame(f, null)).toBeNull();
		expect(validateNewGame({ ...f, start: 'fen', fen: '' }, null)).toMatch(/Paste/);
		expect(validateNewGame({ ...f, start: 'fen', fen: 'not a fen' }, null)).toMatch(/not a legal/);
		expect(validateNewGame({ ...f, start: 'fen', fen: FEN_B }, null)).toBeNull();
		expect(validateNewGame({ ...f, start: 'current' }, null)).toMatch(/no current/);
	});

	it('builds a local-pvp plan with clock (side to move from the FEN) and pvp flags', () => {
		const f = { ...initialNewGameForm(DEFAULT_SETTINGS.clock, 'local-pvp'), start: 'fen' as const, fen: FEN_B, autoFlip: true };
		const plan = buildNewGamePlan(f, null);
		expect(plan.mode).toBe('local-pvp');
		expect(plan.fen).toBe(FEN_B);
		expect(plan.pvp).toEqual({ autoFlip: true, tabletop: false });
		expect(plan.clock).toMatchObject({ toMove: 'black', running: null, config: { initialMs: 5 * 60_000, incrementMs: 3000 } });
		// Tabletop disables auto-flip; no clock when off.
		const t = buildNewGamePlan({ ...f, tabletop: true, clockOn: false }, null);
		expect(t.pvp).toEqual({ autoFlip: false, tabletop: true });
		expect(t.clock).toBeUndefined();
		expect(buildNewGamePlan({ ...f, mode: 'bot', start: 'initial' }, null)).toMatchObject({ mode: 'analysis', fen: INITIAL_FEN, handoffBot: true });
	});
});

describe('NewGameModal → session creation', () => {
	beforeEach(() => {
		freshRepositories();
		resetSettings();
		resetSessionsState();
	});
	afterEach(() => resetSessionsState());

	it('creates a local 2-player session with a clock', () => {
		const onClose = vi.fn();
		render(<NewGameModal open onClose={onClose} />);
		fireEvent.click(screen.getByRole('radio', { name: '2 players' }));
		expect(screen.getByRole('switch', { name: /Chess clock/ })).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: '3+2' }));
		fireEvent.click(screen.getByRole('button', { name: 'Start' }));
		expect(onClose).toHaveBeenCalled();
		const s = activeSession.value!;
		expect(s.mode).toBe('local-pvp');
		expect(s.pvp).toEqual({ autoFlip: false, tabletop: false });
		expect(s.clock?.config).toEqual({ initialMs: 3 * 60_000, incrementMs: 2000 });
		expect(openSessions.value).toHaveLength(1);
	});

	it('shows a FEN error and does not start with an illegal FEN', () => {
		render(<NewGameModal open onClose={() => {}} />);
		fireEvent.click(screen.getByRole('radio', { name: 'FEN' }));
		fireEvent.input(screen.getByLabelText('FEN'), { target: { value: 'garbage' } });
		fireEvent.click(screen.getByRole('button', { name: 'Start' }));
		expect(screen.getByText(/not a legal position/)).toBeTruthy();
		expect(openSessions.value).toHaveLength(0);
	});

	it('analysis from the current position; vs Bot hands off to openBot', () => {
		const src = sessionsActions.newSession();
		sessionsActions.move('e2e4', src.id);
		const fen = activeSession.value!.tree.nodes[activeSession.value!.cursor]!.fen;
		const { unmount } = render(<NewGameModal open onClose={() => {}} />);
		fireEvent.click(screen.getByRole('radio', { name: 'Current' }));
		fireEvent.click(screen.getByRole('button', { name: 'Start' }));
		expect(activeSession.value!.mode).toBe('analysis');
		expect(activeSession.value!.tree.nodes.root!.fen).toBe(fen);
		unmount();

		const openBot = vi.fn();
		const off = commands.register('openBot', openBot);
		render(<NewGameModal open onClose={() => {}} mode="bot" />);
		fireEvent.click(screen.getByRole('button', { name: 'Next: bot' }));
		expect(openBot).toHaveBeenCalledOnce();
		expect(openSessions.value).toHaveLength(3);
		off();
	});
});

describe('local pvp helpers', () => {
	it('auto-flip turns the board to the side to move after a new move', () => {
		const s0 = { ...createSession({ id: 'p', mode: 'local-pvp', now: 0 }), pvp: { autoFlip: true, tabletop: false } };
		const s1 = sessionMove(s0, 'e2e4')!;
		expect(autoFlipOrientation(1, s1)).toBe('black');
		expect(autoFlipOrientation(2, s1)).toBeNull(); // no new node
		expect(autoFlipOrientation(1, { ...s1, pvp: { autoFlip: true, tabletop: true } })).toBeNull();
		expect(autoFlipOrientation(1, { ...s1, mode: 'analysis' })).toBeNull();
	});

	it('resign / draw set the session result', () => {
		freshRepositories();
		resetSessionsState();
		const s = sessionsActions.newSession({ mode: 'local-pvp' });
		resignSession(s, 'white');
		expect(activeSession.value!.result).toEqual({ winner: 'black', reason: 'resign' });
		agreeDraw(activeSession.value!);
		expect(activeSession.value!.result).toEqual({ winner: null, reason: 'draw-agreed' });
	});
});

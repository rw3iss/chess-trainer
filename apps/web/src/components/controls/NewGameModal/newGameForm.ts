// Pure New-game form model: defaults, validation and the plan it produces.
import { INITIAL_FEN, turnFromFen, validateFen } from '@chess/core/chess';
import { createClock, type ClockState } from '@chess/core/clock';
import type { PvpConfig, SessionMode } from '@chess/core/game';
import { resolveClockConfig, type ClockConfigValue } from '@/components/clock';
import type { ClockSettings } from '@/state/settings';

export type NewGameMode = 'analysis' | 'local-pvp' | 'bot';
export type StartPosition = 'initial' | 'current' | 'fen';

export interface NewGameForm {
	mode: NewGameMode;
	start: StartPosition;
	fen: string;
	clockOn: boolean;
	clock: ClockConfigValue;
	autoFlip: boolean;
	tabletop: boolean;
}

export interface NewGamePlan {
	/** Session mode to create ('bot' sessions start as analysis and hand off to the bot modal). */
	mode: SessionMode;
	fen: string;
	pvp?: PvpConfig;
	clock?: ClockState;
	/** Dispatch 'openBot' after creating the session. */
	handoffBot: boolean;
}

export function initialNewGameForm(clock: ClockSettings, mode: NewGameMode = 'analysis'): NewGameForm {
	return {
		mode,
		start: 'initial',
		fen: '',
		clockOn: true,
		clock: { presetId: clock.presetId, custom: { ...clock.custom }, delayMs: clock.delayMs },
		autoFlip: false,
		tabletop: false,
	};
}

/** Error message for the form, or null when it can start. */
export function validateNewGame(form: NewGameForm, currentFen: string | null): string | null {
	if (form.start === 'fen') {
		const fen = form.fen.trim();
		if (!fen) return 'Paste a FEN to start from.';
		if (!validateFen(fen)) return 'That FEN is not a legal position.';
	}
	if (form.start === 'current' && !currentFen) return 'There is no current position — open a game first.';
	return null;
}

export function startFen(form: NewGameForm, currentFen: string | null): string {
	if (form.start === 'fen') return form.fen.trim();
	if (form.start === 'current' && currentFen) return currentFen;
	return INITIAL_FEN;
}

/** Build the session plan. Assumes `validateNewGame` passed. */
export function buildNewGamePlan(form: NewGameForm, currentFen: string | null): NewGamePlan {
	const fen = startFen(form, currentFen);
	if (form.mode === 'local-pvp') {
		return {
			mode: 'local-pvp',
			fen,
			pvp: { autoFlip: form.autoFlip && !form.tabletop, tabletop: form.tabletop },
			clock: form.clockOn ? createClock(resolveClockConfig(form.clock), turnFromFen(fen)) : undefined,
			handoffBot: false,
		};
	}
	return { mode: 'analysis', fen, handoffBot: form.mode === 'bot' };
}

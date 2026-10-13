// Executes a NewGamePlan against the sessions store (and the bot hand-off).
import { INITIAL_FEN } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import { commands } from '@/services/commands';
import { sessionsActions } from '@/state/sessions';
import type { NewGamePlan } from './newGameForm';

export function startNewGame(plan: NewGamePlan): Session {
	const created = sessionsActions.newSession({
		mode: plan.mode,
		fen: plan.fen === INITIAL_FEN ? undefined : plan.fen,
		source: { kind: 'new' },
	});
	let session = created;
	if (plan.pvp || plan.clock) {
		session = sessionsActions.update({ pvp: plan.pvp, ...(plan.clock ? { clock: plan.clock } : {}) }, created.id) ?? created;
	}
	if (plan.handoffBot) commands.dispatch('openBot');
	return session;
}

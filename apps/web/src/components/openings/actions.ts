// Opening → session actions (Load / Fork at ply). The preview never touches the
// active session; only these explicit actions open or replace sessions.
import { lineEnd, ROOT_ID, treeFromUci } from '@chess/core/chess';
import { createSession, type Session } from '@chess/core/game';
import type { OpeningEntry } from '@chess/core/openings';
import { sessionsActions } from '@/state/sessions';
import { settings } from '@/state/settings';
import { markOpeningViewed } from '@/state/openings';
import { toast } from '@/services/toast';

/** Load an opening: new session, or reuse the active untouched opening session (setting). */
export function loadOpening(entry: OpeningEntry): Session {
	const s = sessionsActions.fromOpening(entry, { reuseUntouched: settings.value.openings.loadReusesUntouched });
	markOpeningViewed(entry.id);
	toast.info(`Loaded ${entry.name}`, { id: 'opening-load' });
	return s;
}

/** Session holding the opening line up to `ply`, cursor at that position (pure). */
export function openingForkSession(entry: OpeningEntry, ply: number): Session {
	const k = Math.max(0, Math.min(ply, entry.uci.length));
	const tree = treeFromUci(entry.uci.slice(0, k));
	return createSession({
		tree,
		cursor: lineEnd(tree, ROOT_ID),
		title: `${entry.name} (fork)`,
		orientation: entry.perspective,
		source: { kind: 'fork', openingId: entry.id },
	});
}

/** Fork: always a NEW active session at the given ply. */
export function forkOpeningAt(entry: OpeningEntry, ply: number): Session {
	const s = sessionsActions.open(openingForkSession(entry, ply));
	markOpeningViewed(entry.id);
	toast.info('Forked into a new session', { id: 'fork' });
	return s;
}

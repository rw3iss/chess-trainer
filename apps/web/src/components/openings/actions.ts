// Opening → session actions (Load / Fork at ply). The preview never touches the
// active session; only these explicit actions open or replace sessions.
import { lineEnd, ROOT_ID, treeFromUci } from '@chess/core/chess';
import { createSession, type Session } from '@chess/core/game';
import type { OpeningEntry } from '@chess/core/openings';
import { activeSession, sessionsActions } from '@/state/sessions';
import { getUISetting } from '@/lib/uiSettings';
import { settings } from '@/state/settings';
import { markOpeningViewed, openingIndex } from '@/state/openings';
import { navigate } from '@/lib/navigate';
import { openingPath } from '@/lib/openingLinks';
import { toast } from '@/services/toast';

/**
 * Load an opening (and go to its address, /openings/<slug>): new session, or reuse the active untouched opening session (setting).
 * The board turns to the opening's side unless "Flip board" (UI setting) is off: then it keeps
 * the active session's orientation.
 */
export function loadOpening(entry: OpeningEntry): Session {
	const active = activeSession.value;
	const keepSide = !getUISetting('openings.flipBoard') && active;
	const s = sessionsActions.fromOpening(entry, {
		reuseUntouched: settings.value.openings.loadReusesUntouched,
		...(keepSide ? { orientation: active.orientation } : {}),
	});
	markOpeningViewed(entry.id);
	toast.info(`Loaded ${entry.name}`, { id: 'opening-load' });
	// The address follows the loaded opening (/openings/<slug>), so it can be shared or bookmarked.
	const index = openingIndex.value;
	if (index) navigate(openingPath(index, entry));
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

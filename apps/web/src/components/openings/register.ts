// Openings feature wiring, called once from app/boot.ts:
//   • notesSlots.dataset → DatasetNotes (Wikibooks theory in the Moves panel)
//   • movesSlots.afterList → OpeningVariations (built-on chain + variations in the Moves panel)
//   • live title: an opening session's title follows its line ("<opening>" or "<opening> (custom)")
//     while the title is still an automatic one (never overrides a rename)
//   • 'focusSearch' fallback → open /openings and focus its search box
//     (the Openings page registers its own handler on top while mounted).
import { effect } from '@preact/signals';
import type { OpeningIndex } from '@chess/core/openings';
import { notesSlots } from '@/components/moves/notesSlots';
import { activeSession, sessionsActions } from '@/state/sessions';
import { openingIndex } from '@/state/openings';
import { CUSTOM_SUFFIX, openingTitle, sessionLineStatus } from './lineStatus';
import { movesSlots } from '@/components/moves/movesSlots';
import { OpeningVariations } from './OpeningVariations';
import { commands } from '@/services/commands';
import { DatasetNotes } from './DatasetNotes';

let registered = false;
let names: { index: OpeningIndex; set: Set<string> } | undefined;

/** True when `title` is one the app set (an opening name, maybe "(custom)"), not a user rename. */
export function isAutoTitle(index: OpeningIndex, title: string): boolean {
	if (names?.index !== index) names = { index, set: new Set(index.all().map((e) => e.name)) };
	return names.set.has(title.endsWith(CUSTOM_SUFFIX) ? title.slice(0, -CUSTOM_SUFFIX.length) : title);
}

/** Keep the active opening session's title in step with its line. */
function syncOpeningTitle(): void {
	const s = activeSession.value;
	const index = openingIndex.value;
	if (!s || !index || s.source.kind !== 'opening') return;
	const want = openingTitle(sessionLineStatus(index, s));
	if (want && want !== s.title && isAutoTitle(index, s.title)) sessionsActions.rename(want, s.id);
}
/** Set when navigation to /openings should focus the search box once mounted. */
let pendingFocus = false;

export function consumePendingSearchFocus(): boolean {
	const v = pendingFocus;
	pendingFocus = false;
	return v;
}

export function registerOpeningsFeature(): () => void {
	if (registered) return () => {};
	registered = true;
	const offNotes = notesSlots.dataset.register(DatasetNotes);
	const offVariations = movesSlots.afterList.register(OpeningVariations);
	const offTitle = effect(syncOpeningTitle);
	const offFocus = commands.register('focusSearch', () => {
		pendingFocus = true;
		if (location.pathname !== '/openings') {
			history.pushState(null, '', '/openings');
			dispatchEvent(new PopStateEvent('popstate'));
		}
	});
	return () => {
		offNotes();
		offVariations();
		offFocus();
		offTitle();
		registered = false;
	};
}

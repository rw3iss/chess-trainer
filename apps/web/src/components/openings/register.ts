// Openings feature wiring, called once from app/boot.ts:
//   • notesSlots.dataset → DatasetNotes (Wikibooks theory in the Moves panel)
//   • 'focusSearch' fallback → open /openings and focus its search box
//     (the Openings page registers its own handler on top while mounted).
import { notesSlots } from '@/components/moves/notesSlots';
import { commands } from '@/services/commands';
import { DatasetNotes } from './DatasetNotes';

let registered = false;
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
	const offFocus = commands.register('focusSearch', () => {
		pendingFocus = true;
		if (location.pathname !== '/openings') {
			history.pushState(null, '', '/openings');
			dispatchEvent(new PopStateEvent('popstate'));
		}
	});
	return () => {
		offNotes();
		offFocus();
		registered = false;
	};
}

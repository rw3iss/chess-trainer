// Mounted once in AppShell; renders the SaveModal for the current request.
// The 'save' / 'saveAs' commands are registered at boot by registerGamesFeature()
// (@/components/games) and take precedence over the sessionCommands.ts fallbacks.
import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { commands } from '@/services/commands';
import { getSession } from '@/state/sessions';
import { SaveModal } from './SaveModal';
import { closeSaveModal, requestSave, requestSaveAs, saveModalRequest } from './saveModalState';

/** Register the save commands; returns unregister. */
export function registerSaveCommands(): () => void {
	const offs = [commands.register('save', () => void requestSave()), commands.register('saveAs', () => requestSaveAs())];
	return () => offs.forEach((off) => off());
}

export function SaveModalHost(): JSX.Element {
	const req = saveModalRequest.value;
	// Keep the last request while the modal animates out.
	const last = useRef(req);
	if (req) last.current = req;
	const shown = last.current;
	const session = getSession(shown?.sessionId);
	return <SaveModal key={shown?.seq ?? 0} open={!!req && !!session} session={session} initialChoice={shown?.choice ?? 'new'} onClose={closeSaveModal} />;
}

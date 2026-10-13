// Default handlers for session-level commands. Registered at boot; feature
// modals (SaveModal, BotModal) register later and take precedence (command bus
// is a stack), so these are the graceful fallbacks.
import { treeToPgn } from '@chess/core/chess';
import { commands } from '@/services/commands';
import { toast } from '@/services/toast';
import { activeSession, sessionsActions } from '@/state/sessions';
import { savedGamesActions } from '@/state/savedGames';
import { playbackActions } from '@/state/playback';

async function quickSave(asNew: boolean): Promise<void> {
	const s = activeSession.value;
	if (!s) return;
	try {
		const g = asNew ? await savedGamesActions.saveAs(s.id) : await savedGamesActions.save(s.id);
		if (g) toast.success(`Saved “${g.name}”`, { id: 'save' });
	} catch (e) {
		toast.error(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
	}
}

export async function copyToClipboard(text: string, what: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(`${what} copied`);
	} catch {
		toast.error(`Could not copy ${what.toLowerCase()}`);
	}
}

export function copyPgn(): void {
	const s = activeSession.value;
	if (s) void copyToClipboard(treeToPgn(s.tree, { Event: s.title }), 'PGN');
}

export function copyFen(): void {
	const s = activeSession.value;
	const fen = s?.tree.nodes[s.cursor]?.fen;
	if (fen) void copyToClipboard(fen, 'FEN');
}

/** Register fallback handlers; returns an unregister function. */
export function registerDefaultSessionCommands(): () => void {
	const offs = [
		commands.register('save', () => void quickSave(false)),
		commands.register('saveAs', () => void quickSave(true)),
		commands.register('newGame', () => {
			sessionsActions.newSession();
		}),
		commands.register('fork', () => {
			const f = sessionsActions.fork();
			if (f) toast.info('Forked into a new session', { id: 'fork' });
		}),
		commands.register('flip', () => {
			sessionsActions.flip();
		}),
		commands.register('togglePlay', () => {
			playbackActions.toggle();
		}),
		commands.register('openBot', () => toast.info('Bot play is coming soon.', { id: 'bot' })),
	];
	return () => offs.forEach((off) => off());
}

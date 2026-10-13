// New game / local PvP installer (called once from boot):
//   · 'newGame' opens the NewGameModal (overrides the quick fallback)
//   · 'resign' / 'offerDraw' open the local end-of-game dialogs
//   · mounts GameDialogsHost into its own root
//   · starts the PvP auto-flip controller
import { h, render } from 'preact';
import { commands } from '@/services/commands';
import { openSessions, sessionsActions } from '@/state/sessions';
import { GameDialogsHost } from './GameDialogsHost';
import { openDrawOffer, openNewGame, openResign } from './dialogs';
import { startPvpController } from './pvpController';

declare module '@/services/commands' {
	interface CommandMap {
		/** Resign the active local game (asks which side). */
		resign: void;
		/** Offer a draw in the active local game. */
		offerDraw: void;
	}
}

let installed: (() => void) | null = null;

export function installNewGameFeature(): () => void {
	if (installed) return installed;
	const host = document.createElement('div');
	host.className = 'game-dialogs-root';
	document.body.appendChild(host);
	render(h(GameDialogsHost, {}), host);
	const offs = [
		commands.register('newGame', () => openNewGame()),
		commands.register('resign', () => openResign()),
		commands.register('offerDraw', () => openDrawOffer()),
		startPvpController({
			sessions: () => openSessions.peek(),
			subscribe: (fn) => openSessions.subscribe(() => fn()),
			setOrientation: (id, color) => void sessionsActions.update({ orientation: color }, id),
		}),
	];
	installed = () => {
		offs.forEach((off) => off());
		render(null, host);
		host.remove();
		installed = null;
	};
	return installed;
}

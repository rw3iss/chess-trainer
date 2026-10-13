// Wires the engine feature into the shell: Engine tab, eval bar slot, board
// arrows, the 'openBot' command and an always-mounted BotModal host.
import { render } from 'preact';
import { panelSlots } from '@/components/shell/panelSlots';
import { stageSlots } from '@/components/stage/slots';
import { BotModalHost, openBotModal } from '@/components/controls/BotModal';
import { commands } from '@/services/commands';
import { EnginePanel } from './EnginePanel';
import { EngineEvalBar } from './EngineEvalBar';
import { startEngineShapes } from './engineShapes';

let registered: (() => void) | null = null;

/** Idempotent; returns an unregister function. */
export function registerEngineFeature(): () => void {
	if (registered) return registered;
	const offs = [panelSlots.engine.register(EnginePanel), stageSlots.evalBar.register(EngineEvalBar), commands.register('openBot', openBotModal), startEngineShapes()];
	let host: HTMLElement | null = null;
	if (typeof document !== 'undefined') {
		host = document.createElement('div');
		host.className = 'bot-modal-host';
		document.body.appendChild(host);
		render(<BotModalHost />, host);
	}
	registered = () => {
		offs.forEach((off) => off());
		if (host) {
			render(null, host);
			host.remove();
		}
		registered = null;
	};
	return registered;
}

// Clock + sound feature installer (called once from boot):
//   · registers the clock stage slots
//   · starts the ClockController
//   · wires the sound service to settings and plays move / capture / check /
//     game-end sounds for new moves in the active session
import { effect } from '@preact/signals';
import { activeSession } from '@/state/sessions';
import { settings } from '@/state/settings';
import { sound, soundForTransition, soundSnapshot, type SoundSnapshot } from '@/services/sound';
import { clockController } from './clockService';
import { registerClockSlots } from './ClockSlots';

let installed: (() => void) | null = null;

function installSessionSounds(): () => void {
	let prev: SoundSnapshot | null = null;
	return effect(() => {
		const s = activeSession.value;
		if (!s) {
			prev = null;
			return;
		}
		const kind = soundForTransition(prev, s);
		prev = soundSnapshot(s);
		if (kind) sound.play(kind);
	});
}

export function installClockFeature(): () => void {
	if (installed) return installed;
	sound.setSource(() => settings.peek().sounds);
	const offSlots = registerClockSlots();
	clockController.start();
	const offSounds = installSessionSounds();
	installed = () => {
		offSlots();
		offSounds();
		clockController.stop();
		installed = null;
	};
	return installed;
}

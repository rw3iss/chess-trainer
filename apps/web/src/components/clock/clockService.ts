// The app's single ClockController instance (wired to the sessions/settings
// stores by install.ts). Views read `clockController.now` and call pause/resume.
import { ClockController } from './ClockController';
import { activeId, openSessions, sessionsActions } from '@/state/sessions';
import { settings } from '@/state/settings';
import { sound } from '@/services/sound';

export const clockController = new ClockController({
	now: () => Date.now(),
	sessions: () => openSessions.peek(),
	activeId: () => activeId.peek(),
	update: (id, patch) => void sessionsActions.update(patch, id),
	subscribe: (fn) => openSessions.subscribe(() => fn()),
	settings: () => settings.peek().clock,
	onLowTime: () => {
		if (settings.peek().clock.sound) sound.play('lowTime');
	},
});

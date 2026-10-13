// App-wide PlaybackController wired to the sessions + settings stores.
// Manual moves/steps (sessions 'user-action' events) pause playback; closing a
// session stops it. Use playbackActions from components.
import { computed } from '@preact/signals';
import { nextInLine } from '@chess/core/chess';
import type { PlaybackSpeed } from '@chess/core/game';
import { PlaybackController } from '@/services/playback';
import { activeId, getSession, onSessionEvent, sessionsActions } from './sessions';
import { settings } from './settings';
import { defineStore } from './registry';

export const playback = new PlaybackController({
	canAdvance: (id) => {
		const s = getSession(id);
		return !!s && nextInLine(s.tree, s.cursor) !== null;
	},
	advance: (id) => {
		sessionsActions.step(1, id, { silent: true });
	},
	rewind: (id) => {
		sessionsActions.toStart(id, { silent: true });
	},
	speedOf: (id) => getSession(id)?.playback.speed ?? settings.value.defaultPlaybackSpeed,
	intervalFor: (speed) => settings.value.playback[speed],
});

const offEvents = onSessionEvent((e) => {
	if (e.type === 'user-action' || e.type === 'closed' || e.type === 'opened') playback.pause(e.sessionId);
});

/** Is the ACTIVE session playing? */
export const activeIsPlaying = computed(() => {
	const id = activeId.value;
	return !!id && playback.playing.value.has(id);
});

export const playbackActions = {
	play: (id = activeId.value) => id && playback.play(id),
	pause: (id = activeId.value) => id && playback.pause(id),
	toggle: (id = activeId.value) => id && playback.toggle(id),
	setSpeed(speed: PlaybackSpeed, id = activeId.value): void {
		const s = getSession(id);
		if (!s) return;
		sessionsActions.update({ playback: { ...s.playback, speed } }, s.id);
		playback.retime(s.id);
	},
};

defineStore({
	name: 'playback',
	dispose: () => {
		playback.stopAll();
		offEvents();
	},
});

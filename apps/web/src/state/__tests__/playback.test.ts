import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNode } from '@chess/core/chess';
import { PlaybackController } from '@/services/playback';
import { activeSession, resetSessionsState, sessionsActions } from '@/state/sessions';
import { activeIsPlaying, playback, playbackActions } from '@/state/playback';
import { settings } from '@/state/settings';
import { freshRepositories } from './testDb';

function sanAtCursor(): string {
	const s = activeSession.value!;
	return getNode(s.tree, s.cursor).san;
}

describe('PlaybackController (unit)', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('advances at the configured interval and stops at the end of the line', () => {
		let cursor = 0;
		const len = 3;
		const pc = new PlaybackController({
			canAdvance: () => cursor < len,
			advance: () => void cursor++,
			rewind: () => void (cursor = 0),
			speedOf: () => 'fast',
			intervalFor: (s) => ({ slow: 2000, medium: 1000, fast: 400 })[s],
		});
		pc.play('a');
		expect(pc.isPlaying('a')).toBe(true);
		vi.advanceTimersByTime(399);
		expect(cursor).toBe(0);
		vi.advanceTimersByTime(1);
		expect(cursor).toBe(1);
		vi.advanceTimersByTime(800);
		expect(cursor).toBe(3);
		expect(pc.isPlaying('a')).toBe(false);
	});

	it('rewinds when play is pressed at the end', () => {
		let cursor = 2;
		const pc = new PlaybackController({
			canAdvance: () => cursor < 2,
			advance: () => void cursor++,
			rewind: () => void (cursor = 0),
			speedOf: () => 'medium',
			intervalFor: () => 1000,
		});
		pc.play('a');
		expect(cursor).toBe(0);
		expect(pc.isPlaying('a')).toBe(true);
	});
});

describe('playback store (wired to sessions + settings)', () => {
	beforeEach(() => {
		resetSessionsState();
		freshRepositories();
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	});
	afterEach(() => {
		playback.stopAll();
		vi.useRealTimers();
		resetSessionsState();
	});

	function loadLine(): void {
		sessionsActions.newSession();
		['e2e4', 'e7e5', 'g1f3', 'b8c6'].forEach((m) => sessionsActions.move(m));
		sessionsActions.toStart();
	}

	it('plays from the cursor at the session speed (medium = settings 1000 ms)', () => {
		loadLine();
		expect(settings.value.playback.medium).toBe(1000);
		playbackActions.play();
		expect(activeIsPlaying.value).toBe(true);
		vi.advanceTimersByTime(1000);
		expect(sanAtCursor()).toBe('e4');
		vi.advanceTimersByTime(3000);
		expect(sanAtCursor()).toBe('Nc6');
		expect(activeIsPlaying.value).toBe(false);
	});

	it('speed change re-times the pending step', () => {
		loadLine();
		playbackActions.play();
		playbackActions.setSpeed('fast');
		vi.advanceTimersByTime(400);
		expect(sanAtCursor()).toBe('e4');
	});

	it('any manual step or move pauses playback', () => {
		loadLine();
		playbackActions.play();
		vi.advanceTimersByTime(1000);
		sessionsActions.step(-1);
		expect(activeIsPlaying.value).toBe(false);
		vi.advanceTimersByTime(5000);
		expect(activeSession.value!.cursor).toBe('root');

		playbackActions.play();
		sessionsActions.move('d2d4');
		expect(activeIsPlaying.value).toBe(false);
	});

	it('keeps playing a background session while another is active', () => {
		loadLine();
		const bg = activeSession.value!.id;
		playbackActions.play();
		sessionsActions.newSession();
		vi.advanceTimersByTime(2000);
		expect(playback.isPlaying(bg)).toBe(true);
		sessionsActions.close(bg);
		expect(playback.isPlaying(bg)).toBe(false);
	});
});

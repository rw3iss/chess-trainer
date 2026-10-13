import { describe, expect, it, vi } from 'vitest';
import { createSession, sessionMove, sessionUpdate } from '@chess/core/game';
import { SoundService } from '../soundService';
import { soundForTransition, soundSnapshot } from '../sessionSounds';

function play(ucis: string[]) {
	let s = createSession({ id: 's', now: 0 });
	const kinds: (string | null)[] = [];
	for (const u of ucis) {
		const prev = soundSnapshot(s);
		s = sessionMove(s, u)!;
		kinds.push(soundForTransition(prev, s));
	}
	return { s, kinds };
}

describe('session sounds', () => {
	it('move / capture / check / mate', () => {
		expect(play(['e2e4', 'd7d5', 'e4d5']).kinds).toEqual(['move', 'move', 'capture']);
		expect(play(['e2e4', 'f7f6', 'd1h5']).kinds[2]).toBe('check');
		expect(play(['f2f3', 'e7e5', 'g2g4', 'd8h4']).kinds[3]).toBe('gameEnd');
	});

	it('silent when stepping through history or switching sessions', () => {
		const { s } = play(['e2e4', 'e7e5']);
		const stepped = { ...s, cursor: s.tree.nodes[s.cursor]!.parentId! };
		expect(soundForTransition(soundSnapshot(s), stepped)).toBeNull();
		expect(soundForTransition({ ...soundSnapshot(s), id: 'other' }, s)).toBeNull();
		expect(soundForTransition(null, s)).toBeNull();
	});

	it('game end when a result appears (resign / timeout)', () => {
		const s = createSession({ id: 's', now: 0 });
		const ended = sessionUpdate(s, { result: { winner: 'white', reason: 'timeout' } });
		expect(soundForTransition(soundSnapshot(s), ended)).toBe('gameEnd');
	});
});

describe('SoundService', () => {
	it('respects enabled / volume and supports force', () => {
		const synth = vi.fn();
		const ctx = { state: 'running', resume: vi.fn(() => Promise.resolve()) };
		vi.stubGlobal(
			'AudioContext',
			vi.fn(function () {
				return ctx;
			}),
		);
		let cfg = { enabled: true, volume: 0.5 };
		const svc = new SoundService(() => cfg, synth);
		expect(svc.play('move')).toBe(true);
		expect(synth).toHaveBeenLastCalledWith(ctx, 'move', 0.5);
		cfg = { enabled: false, volume: 0.5 };
		expect(svc.play('move')).toBe(false);
		expect(svc.play('capture', { force: true })).toBe(true);
		cfg = { enabled: true, volume: 0 };
		expect(svc.play('move')).toBe(false);
		vi.unstubAllGlobals();
	});
});

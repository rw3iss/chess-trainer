// Pure session → sound mapping: move / capture / check / game-end when a NEW
// move is added (not when stepping through history). Wired up by the clock
// feature installer (components/clock/install.ts).
import type { Session } from '@chess/core/game';
import type { SoundKind } from './synth';

export interface SoundSnapshot {
	id: string;
	nodes: number;
	result: boolean;
}

export function soundSnapshot(s: Session): SoundSnapshot {
	return { id: s.id, nodes: Object.keys(s.tree.nodes).length, result: !!s.result };
}

/** Which sound (if any) the transition prev → s should make. */
export function soundForTransition(prev: SoundSnapshot | null, s: Session): SoundKind | null {
	if (!prev || prev.id !== s.id) return null;
	if (s.result && !prev.result) return 'gameEnd';
	if (Object.keys(s.tree.nodes).length <= prev.nodes) return null;
	const san = s.tree.nodes[s.cursor]?.san ?? '';
	if (san.includes('#')) return 'gameEnd';
	if (san.includes('+')) return 'check';
	if (san.includes('x')) return 'capture';
	return 'move';
}

import type { PieceSideColors } from '../../../../packages/core/src/theme/types.js';
import { LUX } from './lux.js';
import { SLEEK } from './sleek.js';

export interface OriginalSet {
	id: string;
	name: string;
	author: string;
	license: string;
	viewBox: string;
	/** Shared defs (gradients) emitted once at the top of the sprite. */
	defs?: string;
	symbols: Record<'K' | 'Q' | 'R' | 'B' | 'N' | 'P', string>;
	defaultColors: { white: PieceSideColors; black: PieceSideColors };
}

export const ORIGINAL_SETS: OriginalSet[] = [LUX, SLEEK];

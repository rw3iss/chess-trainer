// Moves panel extension slot: sections under the move list (e.g. opening variations).
//   movesSlots.afterList.register(OpeningVariations)  — openings feature
import type { Session } from '@chess/core/game';
import { createSlot } from '@/app/slots';

export interface MovesSlotProps {
	session: Session;
}

export const movesSlots = {
	afterList: createSlot<MovesSlotProps>('moves.afterList'),
};

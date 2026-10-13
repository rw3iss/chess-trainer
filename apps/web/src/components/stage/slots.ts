// Board-stage extension slots. Clock, eval bar and overlays register here.
//   import { stageSlots } from '@/components/stage/slots';
//   stageSlots.clockTop.register(MyClock);   // receives StageSlotProps
import type { Color } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import { createSlot } from '@/app/slots';

export interface StageSlotProps {
	session: Session;
	/** Which side this slot's player strip belongs to (for clock slots). */
	color: Color;
}

export interface StageSideSlotProps {
	session: Session;
}

export const stageSlots = {
	/** Inside the top player strip (right side) — e.g. the opponent clock. */
	clockTop: createSlot<StageSlotProps>('stage.clockTop'),
	/** Inside the bottom player strip — e.g. the player's clock. */
	clockBottom: createSlot<StageSlotProps>('stage.clockBottom'),
	/** Narrow vertical strip beside the board — e.g. side clocks. */
	side: createSlot<StageSideSlotProps>('stage.side'),
	/** Left of the board — e.g. the EvalBar. */
	evalBar: createSlot<StageSideSlotProps>('stage.evalBar'),
	/** Absolutely positioned over the board — e.g. result banner, overlay clock. */
	overlay: createSlot<StageSideSlotProps>('stage.overlay'),
};

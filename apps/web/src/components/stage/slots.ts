// Board-stage extension slots. Clock, eval bar and overlays register here.
//   import { stageSlots } from '@/components/stage/slots';
//   stageSlots.clockTop.register(MyClock);   // receives StageSlotProps
import type { Color } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import { signal } from '@preact/signals';
import type { Arrow, BoardViewModel, Mark } from '@/components/board';
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

/**
 * Feature-provided board shapes (e.g. engine best-line arrows), keyed by owner so
 * several features can contribute. Drawn under the user's own right-drag shapes.
 *   setStageShapes('engine', { arrows: [...], marks: [] });
 *   setStageShapes('engine', null); // clear
 */
export const stageShapes = signal<Record<string, { arrows: Arrow[]; marks: Mark[] }>>({});

export function setStageShapes(owner: string, shapes: { arrows: Arrow[]; marks: Mark[] } | null): void {
	const next = { ...stageShapes.value };
	if (shapes) next[owner] = shapes;
	else delete next[owner];
	stageShapes.value = next;
}

/**
 * Feature-provided move handling for a session mode (e.g. online play), keyed by owner.
 * `movable` overrides which side may move; `onMove` returning true means the feature
 * handled the move (the stage does NOT apply it locally); `playerLabel` names a side.
 *   setStageMoveHandler('online', { movable: (s) => ..., onMove: (s, uci) => ... });
 */
export interface StageMoveHandler {
	movable?: (session: Session) => BoardViewModel['movable'] | undefined;
	onMove?: (session: Session, uci: string) => boolean;
	playerLabel?: (session: Session, color: Color) => string | undefined;
}

export const stageMoveHandlers = signal<Record<string, StageMoveHandler>>({});

export function setStageMoveHandler(owner: string, handler: StageMoveHandler | null): void {
	const next = { ...stageMoveHandlers.value };
	if (handler) next[owner] = handler;
	else delete next[owner];
	stageMoveHandlers.value = next;
}

/** First non-undefined answer from the registered handlers. */
export function fromMoveHandlers<T>(pick: (h: StageMoveHandler) => T | undefined): T | undefined {
	for (const h of Object.values(stageMoveHandlers.value)) {
		const v = pick(h);
		if (v !== undefined) return v;
	}
	return undefined;
}

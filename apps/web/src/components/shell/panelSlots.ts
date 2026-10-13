// Side-panel extension slots (tabs without a route render a slot).
//   panelSlots.engine.register(EnginePanel)  — the engine feature (phase 8)
import type { Session } from '@chess/core/game';
import { createSlot } from '@/app/slots';

export interface PanelSlotProps {
	session: Session | null;
}

export const panelSlots = {
	engine: createSlot<PanelSlotProps>('panel.engine'),
};

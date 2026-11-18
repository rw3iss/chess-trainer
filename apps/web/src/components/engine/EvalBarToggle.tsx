// Eval bar shortcut. Desktop: stageSlots.rail, left of the board, vertically centered (a left bar opens
// between it and the board). Stacked (phones): stageSlots.stripActions, the end of the bottom player strip.
// Toggles settings.board.evalBar. Hidden in games unless evalBarInGames is on.
import type { JSX } from 'preact';
import { IconButton, Tooltip } from '@/components/common';
import type { StageSideSlotProps } from '@/components/stage/slots';
import { evalBarActions, settings } from '@/state';

export function EvalBarToggle({ session, size = 'md' }: StageSideSlotProps & { size?: 'sm' | 'md' }): JSX.Element | null {
	const board = settings.value.board;
	if (session.mode !== 'analysis' && !board.evalBarInGames) return null;
	const on = board.evalBar;
	return (
		<Tooltip content={on ? 'Hide the evaluation bar' : 'Show the evaluation bar (runs the engine)'} placement="top">
			<IconButton icon="eval-bar" label="Evaluation bar" size={size} variant="solid" active={on} onClick={evalBarActions.toggle} class="eval-bar-toggle" />
		</Tooltip>
	);
}

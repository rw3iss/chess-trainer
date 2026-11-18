// Eval bar shortcut (stageSlots.stripActions): the end of the bottom player strip, opposite the
// captured pieces. Toggles settings.board.evalBar. Hidden in games unless evalBarInGames is on.
import type { JSX } from 'preact';
import { IconButton, Tooltip } from '@/components/common';
import type { StageSideSlotProps } from '@/components/stage/slots';
import { evalBarActions, settings } from '@/state';

export function EvalBarToggle({ session }: StageSideSlotProps): JSX.Element | null {
	const board = settings.value.board;
	if (session.mode !== 'analysis' && !board.evalBarInGames) return null;
	const on = board.evalBar;
	return (
		<Tooltip content={on ? 'Hide the evaluation bar' : 'Show the evaluation bar (runs the engine)'} placement="top">
			<IconButton icon="eval-bar" label="Evaluation bar" size="sm" active={on} onClick={evalBarActions.toggle} class="eval-bar-toggle" />
		</Tooltip>
	);
}

// Eval bar wiring (stageSlots.evalBar): visible on the active session while settings.board.evalBar
// is on (analysis sessions; games too with evalBarInGames). Turning it on runs the engine
// (state/engines.ts). Side: settings.board.evalBarSide; the stage places the slot.
import type { JSX } from 'preact';
import { getNode } from '@chess/core/chess';
import { EvalBar } from '@/components/board';
import type { StageSideSlotProps } from '@/components/stage/slots';
import { activeSession, analysis, evalBarShows, settings } from '@/state';
import { evalBarLabel } from './pvFormat';
import './EngineEvalBar.scss';

export function EngineEvalBar({ session }: StageSideSlotProps): JSX.Element | null {
	const board = settings.value.board;
	if (activeSession.value?.id !== session.id || !evalBarShows(session, board)) return null;
	const horizontal = board.evalBarSide === 'top' || board.evalBarSide === 'bottom';
	const a = analysis.value;
	const fen = getNode(session.tree, session.cursor).fen;
	const best = a && a.fen === fen ? a.lines[0] : undefined;
	return (
		<div class={`engine-evalbar engine-evalbar--${horizontal ? 'h' : 'v'} engine-evalbar--${board.evalBarSide}`}>
			<EvalBar
				whiteProb={best?.winProbability ?? 0.5}
				label={best ? evalBarLabel(best.score) : undefined}
				orientation={session.orientation}
				direction={horizontal ? 'horizontal' : 'vertical'}
			/>
		</div>
	);
}

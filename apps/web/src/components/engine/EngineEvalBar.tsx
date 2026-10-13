// Eval bar wiring (stageSlots.evalBar): visible while analysis runs on the active
// session and settings.board.showEvalBar is on.
import type { JSX } from 'preact';
import { getNode } from '@chess/core/chess';
import { EvalBar } from '@/components/board';
import type { StageSideSlotProps } from '@/components/stage/slots';
import { activeSession, analysis, analysisPrefs, settings } from '@/state';
import { evalBarLabel } from './pvFormat';
import './EngineEvalBar.scss';

export function EngineEvalBar({ session }: StageSideSlotProps): JSX.Element | null {
	if (!analysisPrefs.value.enabled || !settings.value.board.showEvalBar) return null;
	if (activeSession.value?.id !== session.id) return null;
	const a = analysis.value;
	const fen = getNode(session.tree, session.cursor).fen;
	const best = a && a.fen === fen ? a.lines[0] : undefined;
	return (
		<div class="engine-evalbar">
			<EvalBar whiteProb={best?.winProbability ?? 0.5} label={best ? evalBarLabel(best.score) : undefined} orientation={session.orientation} />
		</div>
	);
}

// Engine best-move arrows on the board (setStageShapes('engine', …)).
// Strongest line opaque, others lighter; a hovered PV line shows alone.
import { effect, signal, untracked } from '@preact/signals';
import { getNode } from '@chess/core/chess';
import { setStageShapes } from '@/components/stage/slots';
import { activeSession, analysis, analysisPrefs, settings } from '@/state';
import { linesToArrows } from './pvFormat';

/** multipv of the line under the pointer in PvLines (null = none). */
export const focusedLine = signal<number | null>(null);

export function startEngineShapes(): () => void {
	const off = effect(() => {
		const s = activeSession.value;
		const a = analysis.value;
		const on = analysisPrefs.value.enabled && settings.value.board.showArrows;
		const focus = focusedLine.value;
		const shapes = !on || !s || !a || a.fen !== getNode(s.tree, s.cursor).fen || !a.lines.length ? null : { arrows: linesToArrows(a.lines, focus), marks: [] };
		// setStageShapes reads stageShapes; keep that read out of this effect's dependencies.
		untracked(() => setStageShapes('engine', shapes));
	});
	return () => {
		off();
		setStageShapes('engine', null);
	};
}

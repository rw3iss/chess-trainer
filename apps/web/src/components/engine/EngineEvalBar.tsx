// Eval bar wiring (stageSlots.evalBar): visible on the active session while settings.board.evalBar
// is on (analysis sessions; games too with evalBarInGames). Turning it on runs the engine
// (state/engines.ts). Side: settings.board.evalBarSide; the stage places the slot.
// Opens and closes with an animation (EngineEvalBar.scss): on hide, the last bar stays mounted with
// `--closing` for EVAL_BAR_CLOSE_MS, then unmounts.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { getNode } from '@chess/core/chess';
import { EvalBar, type EvalBarProps } from '@/components/board';
import type { StageSideSlotProps } from '@/components/stage/slots';
import { activeSession, analysis, evalBarShows, settings, type EvalBarSide } from '@/state';
import { evalBarLabel } from './pvFormat';
import './EngineEvalBar.scss';

/** Keep in sync with $dur in EngineEvalBar.scss. */
export const EVAL_BAR_CLOSE_MS = 280;

function reducedMotion(): boolean {
	if (typeof document === 'undefined') return true;
	if (document.documentElement.dataset.motion === 'reduced') return true;
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Shown {
	side: EvalBarSide;
	bar: EvalBarProps;
}

export function EngineEvalBar({ session }: StageSideSlotProps): JSX.Element | null {
	const board = settings.value.board;
	const show = activeSession.value?.id === session.id && evalBarShows(session, board);
	const last = useRef<Shown | null>(null);
	const [, rerender] = useState(0);

	let current: Shown | null = null;
	if (show) {
		const horizontal = board.evalBarSide === 'top' || board.evalBarSide === 'bottom';
		const a = analysis.value;
		const fen = getNode(session.tree, session.cursor).fen;
		const best = a && a.fen === fen ? a.lines[0] : undefined;
		current = {
			side: board.evalBarSide,
			bar: {
				whiteProb: best?.winProbability ?? 0.5,
				label: best ? evalBarLabel(best.score) : undefined,
				orientation: session.orientation,
				direction: horizontal ? 'horizontal' : 'vertical',
			},
		};
	}

	// Shown → hidden: keep the last bar mounted (same render, no gap) for the close animation, then drop it.
	// A switch to another session, or reduced motion, hides at once.
	const shownFor = useRef(session.id);
	if (current) {
		last.current = current;
		shownFor.current = session.id;
	} else if (last.current && (shownFor.current !== session.id || reducedMotion())) last.current = null;
	const closingNow = !current && !!last.current;
	useEffect(() => {
		if (!closingNow) return;
		const t = setTimeout(() => {
			last.current = null;
			rerender((n) => n + 1);
		}, EVAL_BAR_CLOSE_MS);
		return () => clearTimeout(t);
	}, [closingNow]);

	const view = current ?? last.current;
	if (!view) return null;
	const horizontal = view.bar.direction === 'horizontal';
	return (
		<div class={`engine-evalbar engine-evalbar--${horizontal ? 'h' : 'v'} engine-evalbar--${view.side}${current ? '' : ' engine-evalbar--closing'}`}>
			<EvalBar {...view.bar} />
		</div>
	);
}

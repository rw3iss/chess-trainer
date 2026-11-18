import { memo } from 'preact/compat';
import type { Color } from '@chess/core';
import './EvalBar.scss';

export interface EvalBarProps {
	/** White win probability 0..1 (e.g. scoreToWinProbability). */
	whiteProb: number;
	/** Text such as '+1.23' or '#3'. Shown on the leading side's end. */
	label?: string;
	/** Side at the bottom of the board (match the board). */
	orientation?: Color;
	/**
	 * 'vertical' (default): the bottom player's color fills from the bottom.
	 * 'horizontal': the top player's color is on the left, the bottom player's on the right.
	 */
	direction?: 'vertical' | 'horizontal';
	class?: string;
}

/**
 * Evaluation bar. White fills from the bottom player's end: from the bottom (vertical) or from the
 * right (horizontal) when White is at the bottom of the board; from the other end when Black is.
 */
export const EvalBar = memo(function EvalBar({ whiteProb, label, orientation = 'white', direction = 'vertical', class: extra }: EvalBarProps) {
	const p = Number.isFinite(whiteProb) ? Math.min(1, Math.max(0, whiteProb)) : 0.5;
	const pct = Math.round(p * 1000) / 10;
	const whiteLeads = p >= 0.5;
	const horizontal = direction === 'horizontal';
	return (
		<div
			class={`eval-bar eval-bar--${orientation}${horizontal ? ' eval-bar--h' : ''}${extra ? ` ${extra}` : ''}`}
			role="meter"
			aria-label="Evaluation"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={pct}
			aria-valuetext={label ? `${label} (white ${pct}%)` : `white ${pct}%`}
		>
			<div class="eval-bar__white" style={horizontal ? { width: `${pct}%` } : { height: `${pct}%` }} />
			<div class="eval-bar__mid" />
			{label && (
				<span class={`eval-bar__label ${whiteLeads ? 'eval-bar__label--white' : 'eval-bar__label--black'}`}>{label}</span>
			)}
		</div>
	);
});

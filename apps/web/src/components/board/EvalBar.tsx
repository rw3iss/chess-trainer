import { memo } from 'preact/compat';
import type { Color } from '@chess/core';
import './EvalBar.scss';

export interface EvalBarProps {
	/** White win probability 0..1 (e.g. scoreToWinProbability). */
	whiteProb: number;
	/** Text such as '+1.23' or '#3'. Shown on the leading side's end. */
	label?: string;
	/** Side at the bottom (match the board). */
	orientation?: Color;
	class?: string;
}

/** Vertical evaluation bar. White fills from the bottom when orientation is white. */
export const EvalBar = memo(function EvalBar({ whiteProb, label, orientation = 'white', class: extra }: EvalBarProps) {
	const p = Number.isFinite(whiteProb) ? Math.min(1, Math.max(0, whiteProb)) : 0.5;
	const pct = Math.round(p * 1000) / 10;
	const whiteLeads = p >= 0.5;
	return (
		<div
			class={`eval-bar eval-bar--${orientation}${extra ? ` ${extra}` : ''}`}
			role="meter"
			aria-label="Evaluation"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={pct}
			aria-valuetext={label ? `${label} (white ${pct}%)` : `white ${pct}%`}
		>
			<div class="eval-bar__white" style={{ height: `${pct}%` }} />
			<div class="eval-bar__mid" />
			{label && (
				<span class={`eval-bar__label ${whiteLeads ? 'eval-bar__label--white' : 'eval-bar__label--black'}`}>{label}</span>
			)}
		</div>
	);
});

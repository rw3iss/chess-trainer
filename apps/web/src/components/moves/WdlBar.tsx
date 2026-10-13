// White / draw / black percentage bar (opening popularity, explorer stats).
import type { JSX } from 'preact';
import './WdlBar.scss';

export interface WdlBarProps {
	/** Percentages 0..100 (normalised if they don't sum to 100). */
	white: number;
	draws: number;
	black: number;
	games?: number;
}

function compact(n: number): string {
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
	return String(n);
}

export function WdlBar({ white, draws, black, games }: WdlBarProps): JSX.Element {
	const total = white + draws + black || 1;
	const pct = (v: number) => (v / total) * 100;
	const label = `White ${Math.round(pct(white))}%, draw ${Math.round(pct(draws))}%, black ${Math.round(pct(black))}%`;
	return (
		<div class="wdl" role="img" aria-label={label}>
			<div class="wdl__bar">
				<span class="wdl__seg wdl__seg--white" style={{ width: `${pct(white)}%` }}>{pct(white) >= 12 ? `${Math.round(pct(white))}%` : ''}</span>
				<span class="wdl__seg wdl__seg--draw" style={{ width: `${pct(draws)}%` }}>{pct(draws) >= 12 ? `${Math.round(pct(draws))}%` : ''}</span>
				<span class="wdl__seg wdl__seg--black" style={{ width: `${pct(black)}%` }}>{pct(black) >= 12 ? `${Math.round(pct(black))}%` : ''}</span>
			</div>
			{games !== undefined && <span class="wdl__games">{compact(games)} games</span>}
		</div>
	);
}

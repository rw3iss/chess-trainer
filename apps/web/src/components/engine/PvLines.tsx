// MultiPV lines: score chip + numbered SAN line. Click plays the first move,
// hover/focus previews that line's arrow on the board.
import type { JSX } from 'preact';
import type { Uci } from '@chess/core/chess';
import type { AnalysisLine } from '@/services/engine';
import { figurineSan } from '@/lib/format';
import { cx } from '@/lib/classNames';
import { pvToSan, scoreLabel } from './pvFormat';
import './PvLines.scss';

export interface PvLinesProps {
	/** FEN the lines were computed for. */
	fen: string;
	lines: AnalysisLine[];
	/** Expected number of lines (renders placeholders while searching). */
	count: number;
	maxPlies?: number;
	onPlay?: (uci: Uci) => void;
	onFocus?: (multipv: number | null) => void;
	disabled?: boolean;
}

export function PvLines({ fen, lines, count, maxPlies = 12, onPlay, onFocus, disabled }: PvLinesProps): JSX.Element {
	const rows = Array.from({ length: Math.max(count, lines.length) }, (_, i) => lines[i]);
	return (
		<ol class="pv-lines" aria-label="Engine lines">
			{rows.map((line, i) => {
				if (!line) {
					return (
						<li key={`ph${i}`} class="pv-lines__row pv-lines__row--placeholder" aria-hidden="true">
							<span class="pv-lines__score">…</span>
							<span class="pv-lines__moves" />
						</li>
					);
				}
				const tokens = pvToSan(fen, line.pv, maxPlies);
				const first = tokens[0];
				const cp = line.score.mate !== undefined ? Math.sign(line.score.mate) : Math.sign(line.score.cp ?? 0);
				const label = scoreLabel(line.score);
				return (
					<li key={line.multipv} class="pv-lines__item">
						<button
							type="button"
							class={cx('pv-lines__row', i === 0 && 'pv-lines__row--best')}
							disabled={disabled || !first}
							title={first ? `Play ${first.san}` : undefined}
							aria-label={`${label}: ${tokens.map((t) => `${t.prefix}${t.san}`).join(' ')}. Play ${first?.san ?? ''}`}
							onClick={() => first && onPlay?.(first.uci)}
							onMouseEnter={() => onFocus?.(line.multipv)}
							onMouseLeave={() => onFocus?.(null)}
							onFocus={() => onFocus?.(line.multipv)}
							onBlur={() => onFocus?.(null)}
						>
							<span class={cx('pv-lines__score', cp > 0 && 'pv-lines__score--white', cp < 0 && 'pv-lines__score--black')}>{label}</span>
							<span class="pv-lines__moves">
								{tokens.map((t, k) => (
									<span key={k} class={cx('pv-lines__move', k === 0 && 'pv-lines__move--first')}>
										{t.prefix && <span class="pv-lines__num">{t.prefix}</span>}
										{figurineSan(t.san)}
									</span>
								))}
							</span>
							<span class="pv-lines__depth">d{line.depth}</span>
						</button>
					</li>
				);
			})}
		</ol>
	);
}

// "Stats: Lichess | Masters" — picks the ONE game-stats database every count, W/D/L bar,
// popularity bar and popularity sort shows (UI setting 'openings.statsSource').
import type { JSX } from 'preact';
import { STATS_SOURCE_LABELS, type StatsSource } from '@chess/core/openings';
import { SegmentedControl, type SegmentOption } from '@/components/common/SegmentedControl';
import { useUISetting } from '@/hooks/useUISetting';
import { cx } from '@/lib/classNames';
import './StatsSourceControl.scss';

export const STATS_SOURCE_HINTS: Record<StatsSource, string> = {
	lichess: 'Lichess: online games, blitz–classical, 1600–2500',
	masters: 'Masters: over-the-board games, players 2200+',
};

const OPTIONS: SegmentOption<StatsSource>[] = (['lichess', 'masters'] as const).map((value) => ({ value, label: STATS_SOURCE_LABELS[value], title: STATS_SOURCE_HINTS[value] }));

export interface StatsSourceControlProps {
	/** Show the "Stats" prefix label (toolbar). */
	showLabel?: boolean;
	class?: string;
}

export function StatsSourceControl({ showLabel, class: className }: StatsSourceControlProps): JSX.Element {
	const [source, setSource] = useUISetting('openings.statsSource');
	return (
		<span class={cx('stats-source', className)} data-testid="stats-source">
			{showLabel && (
				<span class="stats-source__label" aria-hidden="true">
					Stats
				</span>
			)}
			<SegmentedControl<StatsSource> size="sm" ariaLabel="Opening stats database" value={source} onChange={setSource} options={OPTIONS} />
		</span>
	);
}

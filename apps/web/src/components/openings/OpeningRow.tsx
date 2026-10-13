// One opening in the browser list (fixed height for VirtualList):
// ★ · name (display serif) + ECO chip · SAN preview · popularity + W/D/L · side.
import { memo } from 'preact/compat';
import type { JSX } from 'preact';
import type { OpeningEntry } from '@chess/core/openings';
import { IconButton } from '@/components/common/IconButton';
import { Chip } from '@/components/common/Chip';
import { Icon } from '@/components/common/Icon';
import { cx } from '@/lib/classNames';
import { compactCount, sanLine } from './format';
import './OpeningRow.scss';

export const OPENING_ROW_HEIGHT = 64;
const PREVIEW_PLIES = 16;

export interface OpeningRowProps {
	entry: OpeningEntry;
	selected?: boolean;
	favorite?: boolean;
	/** Grouped by family: show only the variation (family is the group header). */
	compact?: boolean;
	onSelect: (entry: OpeningEntry) => void;
	onHover?: (entry: OpeningEntry) => void;
	onToggleFavorite: (entry: OpeningEntry) => void;
}

function SideMark({ side }: { side: OpeningEntry['perspective'] }): JSX.Element {
	const label = side === 'white' ? 'A White opening' : 'A Black defence';
	return <span class={cx('opening-row__side', `opening-row__side--${side}`)} role="img" aria-label={label} title={label} />;
}

function Stats({ entry }: { entry: OpeningEntry }): JSX.Element | null {
	const p = entry.popularity;
	if (!p) return null;
	const total = p.white + p.draws + p.black || 1;
	const label = `Popularity ${p.score}/100 · ${compactCount(p.games)} games · White ${Math.round(p.white)}% · Draw ${Math.round(p.draws)}% · Black ${Math.round(p.black)}%`;
	return (
		<span class="opening-row__stats" title={label} role="img" aria-label={label}>
			<span class="opening-row__pop">
				<span class="opening-row__pop-fill" style={{ width: `${Math.max(4, p.score)}%` }} />
			</span>
			<span class="opening-row__wdl">
				<span class="opening-row__wdl-seg opening-row__wdl-seg--white" style={{ width: `${(p.white / total) * 100}%` }} />
				<span class="opening-row__wdl-seg opening-row__wdl-seg--draw" style={{ width: `${(p.draws / total) * 100}%` }} />
				<span class="opening-row__wdl-seg opening-row__wdl-seg--black" style={{ width: `${(p.black / total) * 100}%` }} />
			</span>
		</span>
	);
}

export const OpeningRow = memo(function OpeningRow({ entry, selected, favorite, compact, onSelect, onHover, onToggleFavorite }: OpeningRowProps): JSX.Element {
	const title = compact ? (entry.variation ?? 'Main line') : entry.family;
	const sub = compact ? undefined : entry.variation;
	return (
		<div class={cx('opening-row', { 'opening-row--selected': !!selected, 'opening-row--compact': !!compact })} data-opening-id={entry.id}>
			<IconButton
				class={cx('opening-row__star', { 'opening-row__star--on': !!favorite })}
				icon={favorite ? 'star-filled' : 'star'}
				label={favorite ? `Remove ${entry.name} from favorites` : `Add ${entry.name} to favorites`}
				size="sm"
				active={!!favorite}
				onClick={() => onToggleFavorite(entry)}
			/>
			<button
				type="button"
				class="opening-row__main"
				aria-current={selected ? 'true' : undefined}
				aria-label={`${entry.name}, ${entry.eco}`}
				onClick={() => onSelect(entry)}
				onMouseEnter={onHover ? () => onHover(entry) : undefined}
			>
				<span class="opening-row__top">
					<span class="opening-row__name">
						{title}
						{sub && <span class="opening-row__variation">{sub}</span>}
					</span>
					<Chip label={entry.eco} mono size="sm" class="opening-row__eco" />
				</span>
				<span class="opening-row__bottom">
					<span class="opening-row__moves">
						{sanLine(entry.san, PREVIEW_PLIES)}
						{entry.san.length > PREVIEW_PLIES ? ' …' : ''}
					</span>
					{entry.hasNotes && <span class="opening-row__notes" title="Has notes" aria-label="Has notes" />}
					<Stats entry={entry} />
					<SideMark side={entry.perspective} />
				</span>
			</button>
		</div>
	);
});

export interface FamilyRowProps {
	family: string;
	count: number;
	expanded: boolean;
	onToggle: (family: string) => void;
}

/** Collapsible family header in grouped mode (same height as an opening row). */
export function FamilyRow({ family, count, expanded, onToggle }: FamilyRowProps): JSX.Element {
	return (
		<button type="button" class={cx('family-row', { 'family-row--expanded': expanded })} aria-expanded={expanded} onClick={() => onToggle(family)}>
			<Icon name="chevron-right" size={16} class="family-row__chevron" />
			<span class="family-row__name">{family}</span>
			<span class="family-row__count">{count}</span>
		</button>
	);
}

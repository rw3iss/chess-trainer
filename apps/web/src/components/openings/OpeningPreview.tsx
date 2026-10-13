// Preview of an opening line (does NOT touch the active session): mini board +
// scrubber + clickable moves; actions Load · Fork here · ★ · Details.
// layout 'card' = desktop panel header, 'inline' = mobile row expansion.
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import type { OpeningEntry } from '@chess/core/openings';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { Chip } from '@/components/common/Chip';
import { StageMiniBoard } from '@/components/stage/BoardStage';
import { isFavorite, toggleFavorite } from '@/state/favorites';
import { cx } from '@/lib/classNames';
import { forkOpeningAt, loadOpening } from './actions';
import { usePreviewLine } from './usePreviewLine';
import { PlyScrubber } from './PlyScrubber';
import './OpeningPreview.scss';

export interface OpeningPreviewProps {
	entry: OpeningEntry;
	layout?: 'card' | 'inline';
	onClose?: () => void;
	/** Called after Load / Fork (e.g. navigate to the board). */
	onOpened?: () => void;
}

export function LineMoves({ san, ply, onPly }: { san: readonly string[]; ply: number; onPly: (p: number) => void }): JSX.Element {
	return (
		<ol class="line-moves" aria-label="Moves">
			{san.map((m, i) => (
				<li key={i} class="line-moves__item">
					{i % 2 === 0 && <span class="line-moves__num">{i / 2 + 1}.</span>}
					<button type="button" class={cx('line-moves__move', { 'line-moves__move--current': ply === i + 1 })} aria-current={ply === i + 1 ? 'step' : undefined} onClick={() => onPly(i + 1)}>
						{m}
					</button>
				</li>
			))}
		</ol>
	);
}

export function OpeningPreview({ entry, layout = 'card', onClose, onOpened }: OpeningPreviewProps): JSX.Element {
	const { route } = useLocation();
	const preview = usePreviewLine(entry);
	const fav = isFavorite('opening', entry.id);
	const forkLabel = preview.ply === preview.plies ? 'Fork' : 'Fork here';

	const sideLabel = entry.perspective === 'white' ? 'White' : 'Black';
	return (
		<section class={cx('opening-preview', `opening-preview--${layout}`)} aria-label={`Preview: ${entry.name}`}>
			<div class="opening-preview__board">{preview.session && <StageMiniBoard session={preview.session} />}</div>
			<header class="opening-preview__head">
				<div class="opening-preview__eyebrow">
					<Chip label={entry.eco} mono size="sm" tone="accent" />
					<span class="opening-preview__family">{entry.variation ? entry.family : `${sideLabel} · ${entry.plies} ${entry.plies === 1 ? 'ply' : 'plies'}`}</span>
				</div>
				<h2 class="opening-preview__name" title={entry.name}>
					{entry.variation ?? entry.name}
				</h2>
				{onClose && <IconButton class="opening-preview__close" icon="close" label="Close preview" size="sm" onClick={onClose} />}
			</header>
			<div class="opening-preview__moves">
				<LineMoves san={entry.san} ply={preview.ply} onPly={preview.setPly} />
			</div>
			<PlyScrubber class="opening-preview__scrub" variant="compact" ply={preview.ply} san={entry.san} onChange={preview.setPly} />
			<div class="opening-preview__actions">
				<Button
					variant="primary"
					size="sm"
					icon="play"
					onClick={() => {
						loadOpening(entry);
						onOpened?.();
					}}
				>
					Load
				</Button>
				<Button
					size="sm"
					icon="fork"
					title={`New session at ${preview.ply === 0 ? 'the start' : `move ${Math.ceil(preview.ply / 2)}`}`}
					onClick={() => {
						forkOpeningAt(entry, preview.ply);
						onOpened?.();
					}}
				>
					{forkLabel}
				</Button>
				<IconButton icon={fav ? 'star-filled' : 'star'} label={fav ? 'Remove from favorites' : 'Add to favorites'} active={fav} size="sm" class={cx('opening-preview__star', { 'opening-preview__star--on': fav })} onClick={() => void toggleFavorite('opening', entry.id)} />
				<Button size="sm" variant="ghost" iconRight="chevron-right" class="opening-preview__details" onClick={() => route(`/openings/${entry.id}`)}>
					Details
				</Button>
			</div>
		</section>
	);
}

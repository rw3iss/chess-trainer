// Gallery cards: BoardThemeCard (live MiniBoard thumbnail) and PieceThemeCard
// (piece strip + author / licence). Both are radio-like selectable buttons.
import type { JSX } from 'preact';
import type { BoardTheme, PieceSetAsset, PieceTheme } from '@chess/core/theme';
import { MiniBoard } from '@/components/board';
import { Badge } from '@/components/common/Badge';
import { Icon } from '@/components/common/Icon';
import { cx } from '@/lib/classNames';
import { PieceSetPreview } from './PieceSetPreview';
import { THUMB_FEN, THUMB_LAST_MOVE } from './previewPositions';
import './ThemeCards.scss';

export interface BoardThemeCardProps {
	theme: BoardTheme;
	pieceTheme: PieceTheme;
	pieceSet: PieceSetAsset;
	selected: boolean;
	onSelect: () => void;
}

export function BoardThemeCard({ theme, pieceTheme, pieceSet, selected, onSelect }: BoardThemeCardProps): JSX.Element {
	return (
		<button type="button" role="radio" aria-checked={selected} class={cx('theme-card', selected && 'theme-card--selected')} onClick={onSelect}>
			<span class="theme-card__visual">
				<MiniBoard fen={THUMB_FEN} lastMove={THUMB_LAST_MOVE} boardTheme={theme} pieceTheme={pieceTheme} pieceSet={pieceSet} label={`${theme.name} board`} />
				{selected && (
					<span class="theme-card__check" aria-hidden="true">
						<Icon name="check" size={14} strokeWidth={2.5} />
					</span>
				)}
			</span>
			<span class="theme-card__meta">
				<span class="theme-card__name">{theme.name}</span>
				{!theme.builtIn && <Badge tone="accent">Custom</Badge>}
			</span>
		</button>
	);
}

export interface PieceThemeCardProps {
	theme: PieceTheme;
	pieceSet: PieceSetAsset;
	boardTheme: BoardTheme;
	selected: boolean;
	onSelect: () => void;
}

export function PieceThemeCard({ theme, pieceSet, boardTheme, selected, onSelect }: PieceThemeCardProps): JSX.Element {
	return (
		<button type="button" role="radio" aria-checked={selected} class={cx('theme-card', 'theme-card--piece', selected && 'theme-card--selected')} onClick={onSelect}>
			<span class="theme-card__visual">
				<PieceSetPreview pieceTheme={theme} pieceSet={pieceSet} boardTheme={boardTheme} roles={['king', 'queen', 'knight']} />
				{selected && (
					<span class="theme-card__check" aria-hidden="true">
						<Icon name="check" size={14} strokeWidth={2.5} />
					</span>
				)}
			</span>
			<span class="theme-card__meta">
				<span class="theme-card__name">{theme.name}</span>
				{!theme.builtIn && <Badge tone="accent">Custom</Badge>}
				{pieceSet.personalUseOnly && (
					<Badge tone="warn" title="Licensed for personal, non-commercial use only">
						Personal use
					</Badge>
				)}
			</span>
			<span class="theme-card__byline" title={pieceSet.license}>
				{pieceSet.author} · {pieceSet.license}
			</span>
		</button>
	);
}

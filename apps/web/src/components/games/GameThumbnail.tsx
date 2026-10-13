// Mini board of a saved game's final mainline position, with the active themes.
import type { JSX } from 'preact';
import type { Color } from '@chess/core/chess';
import { MiniBoard } from '@/components/board';
import { Icon } from '@/components/common/Icon';
import { activeBoardTheme, activePieceSet, activePieceTheme } from '@/state/themes';
import { cx } from '@/lib/classNames';
import './GameThumbnail.scss';

export interface GameThumbnailProps {
	fen: string;
	orientation?: Color;
	label?: string;
	class?: string;
}

export function GameThumbnail({ fen, orientation = 'white', label, class: className }: GameThumbnailProps): JSX.Element {
	const boardTheme = activeBoardTheme.value;
	const pieceTheme = activePieceTheme.value;
	const pieceSet = activePieceSet.value;
	if (!boardTheme || !pieceTheme || !pieceSet) {
		return (
			<span class={cx('game-thumb', 'game-thumb--fallback', className)} aria-hidden="true">
				<Icon name="board" />
			</span>
		);
	}
	return (
		<span class={cx('game-thumb', className)}>
			<MiniBoard fen={fen} orientation={orientation} boardTheme={boardTheme} pieceTheme={pieceTheme} pieceSet={pieceSet} label={label} />
		</span>
	);
}

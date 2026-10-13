// PieceSetPreview — a strip of pieces (K Q R B N P, white over black) drawn from
// a piece set's sprite with a piece theme's colours, on board-coloured squares.
import type { JSX } from 'preact';
import type { Color, Role } from '@chess/core/chess';
import { boardThemeCssVars, pieceThemeCssVars, type BoardTheme, type PieceSetAsset, type PieceTheme } from '@chess/core/theme';
import { pieceSymbolHref } from '@/components/board';
import { cx } from '@/lib/classNames';
import { useSprite } from './useSprite';
import './PieceSetPreview.scss';

const ROLES: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const SIDES: Color[] = ['white', 'black'];

export interface PieceSetPreviewProps {
	pieceTheme: PieceTheme;
	pieceSet: PieceSetAsset;
	/** Squares behind the pieces; omit for a neutral surface. */
	boardTheme?: BoardTheme;
	/** Roles to show (default all six). */
	roles?: Role[];
	class?: string;
}

export function PieceSetPreview({ pieceTheme, pieceSet, boardTheme, roles = ROLES, class: className }: PieceSetPreviewProps): JSX.Element {
	useSprite(pieceSet);
	const style = { ...(boardTheme ? boardThemeCssVars(boardTheme) : {}), ...pieceThemeCssVars(pieceTheme) } as JSX.CSSProperties;
	const cols = roles.length;
	return (
		<svg
			class={cx('piece-preview', !boardTheme && 'piece-preview--plain', className)}
			viewBox={`0 0 ${cols} 2`}
			role="img"
			aria-label={`${pieceSet.name} pieces`}
			style={style}
		>
			{SIDES.map((side, y) =>
				roles.map((role, x) => (
					<g key={`${side}${role}`}>
						<rect class={(x + y) % 2 === 0 ? 'piece-preview__light' : 'piece-preview__dark'} x={x} y={y} width={1} height={1} />
						<use class={`piece-preview__piece piece-preview__piece--${side}`} href={pieceSymbolHref(pieceSet, side, role)} x={x} y={y} width={1} height={1} />
					</g>
				)),
			)}
		</svg>
	);
}

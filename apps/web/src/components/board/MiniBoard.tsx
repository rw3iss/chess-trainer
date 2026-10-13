import { memo } from 'preact/compat';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { piecesFromFen } from '@chess/core';
import type { Color, SquareName } from '@chess/core';
import { boardThemeCssVars, pieceThemeCssVars } from '@chess/core/theme';
import type { BoardTheme, PieceSetAsset, PieceTheme } from '@chess/core/theme';
import { squareToCell } from './lib/geometry';
import { isSpriteLoaded, loadPieceSprite, pieceSymbolHref } from './lib/spriteLoader';
import './MiniBoard.scss';

export interface MiniBoardProps {
	fen: string;
	orientation?: Color;
	boardTheme: BoardTheme;
	pieceTheme: PieceTheme;
	pieceSet: PieceSetAsset;
	lastMove?: [SquareName, SquareName];
	/** CSS size (e.g. 120 or '8rem'). Defaults to 100% of the container. */
	size?: number | string;
	class?: string;
	/** Accessible label; defaults to the FEN. */
	label?: string;
}

/** Static, non-interactive thumbnail: one SVG, cheap to render many in lists. */
export const MiniBoard = memo(function MiniBoard(p: MiniBoardProps) {
	const orientation = p.orientation ?? 'white';
	const [, setTick] = useState(0);
	useEffect(() => {
		if (isSpriteLoaded(p.pieceSet.id)) return;
		let alive = true;
		loadPieceSprite(p.pieceSet).then(
			() => alive && setTick((n) => n + 1),
			() => {},
		);
		return () => {
			alive = false;
		};
	}, [p.pieceSet.id]);

	const pieces = useMemo(() => piecesFromFen(p.fen), [p.fen]);
	const vars = useMemo(
		() => ({ ...boardThemeCssVars(p.boardTheme), ...pieceThemeCssVars(p.pieceTheme) }),
		[p.boardTheme, p.pieceTheme],
	);

	const squares: JSX.Element[] = [];
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			if ((x + y) % 2 === 1) squares.push(<rect key={y * 8 + x} x={x} y={y} width={1} height={1} />);
		}
	}
	const style: Record<string, string> = { ...vars };
	if (p.size !== undefined) style.width = typeof p.size === 'number' ? `${p.size}px` : p.size;

	return (
		<svg
			class={`mini-board${p.class ? ` ${p.class}` : ''}`}
			viewBox="0 0 8 8"
			role="img"
			aria-label={p.label ?? `Position ${p.fen}`}
			style={style as JSX.CSSProperties}
		>
			<rect class="mini-board__light" width={8} height={8} />
			<g class="mini-board__dark" shape-rendering="crispEdges">{squares}</g>
			{p.lastMove?.map((sq) => {
				const c = squareToCell(sq, orientation);
				return <rect key={`lm${sq}`} class="mini-board__last" x={c.x} y={c.y} width={1} height={1} />;
			})}
			{pieces.map((pc) => {
				const c = squareToCell(pc.square, orientation);
				return (
					<use
						key={pc.square}
						class={`mini-board__piece mini-board__piece--${pc.color}`}
						href={pieceSymbolHref(p.pieceSet, pc.color, pc.role)}
						x={c.x}
						y={c.y}
						width={1}
						height={1}
					/>
				);
			})}
		</svg>
	);
});

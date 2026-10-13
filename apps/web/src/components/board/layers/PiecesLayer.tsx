import { memo } from 'preact/compat';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import type { Color, Role } from '@chess/core';
import type { PieceSetAsset } from '@chess/core/theme';
import type { TrackedPiece } from '../lib/pieceDiff';
import { cellTransform, squareToCell } from '../lib/geometry';
import { pieceSymbolHref } from '../lib/spriteLoader';

const EASE = 'cubic-bezier(0.22, 0.8, 0.32, 1)';

export interface PieceGlyphProps {
	set: Pick<PieceSetAsset, 'id' | 'layout' | 'viewBox'>;
	color: Color;
	role: Role;
}

/** The bare piece SVG (also used by the drag ghost and promotion picker). */
export function PieceGlyph({ set, color, role }: PieceGlyphProps) {
	return (
		<svg class="board__piece-svg" viewBox={set.viewBox} aria-hidden="true" focusable="false">
			<use href={pieceSymbolHref(set, color, role)} />
		</svg>
	);
}

interface PieceProps {
	set: PieceSetAsset;
	color: Color;
	role: Role;
	x: number;
	y: number;
	orientation: Color;
	animationMs: number;
	/** Skip the move animation (piece was just dropped there). */
	instant: boolean;
	dragOrigin: boolean;
	fading?: boolean;
}

/** One piece. Memoised: re-renders only when its own props change. FLIP-animates via WAAPI. */
export const Piece = memo(function Piece(p: PieceProps) {
	const ref = useRef<HTMLDivElement>(null);
	const prev = useRef<{ x: number; y: number; orientation: Color } | null>(null);

	useLayoutEffect(() => {
		const el = ref.current;
		const before = prev.current;
		prev.current = { x: p.x, y: p.y, orientation: p.orientation };
		if (!el || !before || p.animationMs <= 0 || p.instant) return;
		if (before.orientation !== p.orientation) return;
		if (before.x === p.x && before.y === p.y) return;
		if (typeof el.animate !== 'function') return;
		el.getAnimations?.().forEach((a) => a.cancel());
		const dist = Math.hypot(p.x - before.x, p.y - before.y);
		el.animate(
			[{ transform: cellTransform(before), zIndex: 3 }, { transform: cellTransform(p), zIndex: 3 }],
			{ duration: Math.round(p.animationMs * Math.min(1.35, 0.8 + dist * 0.08)), easing: EASE },
		);
	}, [p.x, p.y, p.orientation, p.animationMs, p.instant]);

	const cls =
		`board__piece board__piece--${p.color} board__piece--${p.role}` +
		(p.dragOrigin ? ' board__piece--drag-origin' : '') +
		(p.fading ? ' board__piece--fading' : '');
	return (
		<div ref={ref} class={cls} style={{ transform: cellTransform(p) }}>
			<PieceGlyph set={p.set} color={p.color} role={p.role} />
		</div>
	);
});

interface LayerProps {
	set: PieceSetAsset;
	pieces: readonly TrackedPiece[];
	fading: readonly TrackedPiece[];
	orientation: Color;
	animationMs: number;
	instantSquare: string | null;
	dragId: string | null;
}

export const PiecesLayer = memo(function PiecesLayer(p: LayerProps) {
	return (
		<div class="board__pieces" style={{ '--board-anim-ms': `${p.animationMs}ms` } as JSX.CSSProperties}>
			{p.fading.map((pc) => {
				const c = squareToCell(pc.square, p.orientation);
				return (
					<Piece
						key={`fade-${pc.id}`}
						set={p.set}
						color={pc.color}
						role={pc.role}
						x={c.x}
						y={c.y}
						orientation={p.orientation}
						animationMs={0}
						instant
						dragOrigin={false}
						fading
					/>
				);
			})}
			{p.pieces.map((pc) => {
				const c = squareToCell(pc.square, p.orientation);
				return (
					<Piece
						key={pc.id}
						set={p.set}
						color={pc.color}
						role={pc.role}
						x={c.x}
						y={c.y}
						orientation={p.orientation}
						animationMs={p.animationMs}
						instant={p.instantSquare === pc.square}
						dragOrigin={p.dragId === pc.id}
					/>
				);
			})}
		</div>
	);
});

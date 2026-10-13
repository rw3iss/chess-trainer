import type { Color, PromotionRole, SquareName } from '@chess/core';
import type { BoardTheme, PieceTheme, PieceSetAsset } from '@chess/core/theme';

/** Contract every board renderer (Board2D now, Board3D later) implements. */

export interface Arrow {
	from: SquareName;
	to: SquareName;
	/** CSS color; defaults to the theme arrow color. */
	color?: string;
	/** 0..1 — e.g. engine line rank. */
	opacity?: number;
}

export interface Mark {
	square: SquareName;
	kind: 'circle' | 'dot' | 'highlight';
	color?: string;
}

export interface BoardViewModel {
	fen: string;
	orientation: Color;
	lastMove?: [SquareName, SquareName];
	/** Square of the king in check. */
	check?: SquareName;
	/** Legal destinations per origin square. Empty map = no moves allowed. */
	dests: Map<SquareName, SquareName[]>;
	/** Which side the user may move ('both' in analysis / local pvp). */
	movable: Color | 'both' | 'none';
	arrows: Arrow[];
	marks: Mark[];
	premove?: [SquareName, SquareName];
	animationMs: number;
	coordinates: 'inside' | 'outside' | 'none';
	showLegalDots: boolean;
	showLastMove: boolean;
	showCheck: boolean;
	/** Drag, click-click, or both. */
	input: 'drag' | 'click' | 'both';
}

export interface BoardEvents {
	onMove(from: SquareName, to: SquareName, promotion?: PromotionRole): void;
	onSelect?(square: SquareName | null): void;
	/** User-drawn arrow / circle (right-drag / right-click). */
	onDraw?(shapes: { arrows: Arrow[]; marks: Mark[] }): void;
}

export interface BoardAppearance {
	boardTheme: BoardTheme;
	pieceTheme: PieceTheme;
	pieceSet: PieceSetAsset;
}

export type BoardRendererProps = BoardViewModel & BoardEvents & BoardAppearance & { class?: string };

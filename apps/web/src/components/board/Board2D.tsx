import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { piecesFromFen } from '@chess/core';
import type { Color, PromotionRole, Role, SquareName } from '@chess/core';
import { boardThemeCssVars, pieceThemeCssVars } from '@chess/core/theme';
import type { Arrow, BoardRendererProps, Mark } from './types';
import { SquaresLayer } from './layers/SquaresLayer';
import { TextureLayer } from './layers/TextureLayer';
import { HighlightsLayer } from './layers/HighlightsLayer';
import { CoordsLayer } from './layers/CoordsLayer';
import { PieceGlyph, PiecesLayer } from './layers/PiecesLayer';
import { ShapesLayer } from './layers/ShapesLayer';
import { PromotionPicker } from './PromotionPicker';
import { cellToSquare, squareFromPoint, squareToCell, squareToIdx, stepSquare } from './lib/geometry';
import { applyOptimisticMove, diffPieces, pieceAt, type TrackedPiece } from './lib/pieceDiff';
import { brushFor, toggleArrow, toggleMark } from './lib/shapes';
import { loadPieceSprite } from './lib/spriteLoader';
import { usePrefersReducedMotion } from './lib/useReducedMotion';
import './Board2D.scss';

const DRAG_THRESHOLD_MOUSE = 4;
const DRAG_THRESHOLD_TOUCH = 8;
const PENDING_TIMEOUT_MS = 1500;

interface PointerSession {
	pointerId: number;
	square: SquareName;
	pieceId: string;
	color: Color;
	role: Role;
	startX: number;
	startY: number;
	wasSelected: boolean;
	dragging: boolean;
	touch: boolean;
	overSquare: SquareName | null;
}

interface DrawSession {
	pointerId: number;
	from: SquareName;
	to: SquareName;
	color?: string;
}

interface PendingMove {
	fen: string;
	from: SquareName;
	to: SquareName;
	promotion?: PromotionRole;
}

const ROLE_NAME: Record<Role, string> = {
	king: 'king',
	queen: 'queen',
	rook: 'rook',
	bishop: 'bishop',
	knight: 'knight',
	pawn: 'pawn',
};

function useBoardSize(coordinates: BoardRendererProps['coordinates']) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [avail, setAvail] = useState(0);
	useLayoutEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const measure = (w: number, h: number) => setAvail(Math.floor(h > 0 ? Math.min(w, h) : w));
		const r = el.getBoundingClientRect();
		measure(r.width, r.height);
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver((entries) => {
			const box = entries[0]?.contentRect;
			if (box) measure(box.width, box.height);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const gutter = coordinates === 'outside' ? Math.max(14, Math.round(avail * 0.035)) : 0;
	const square = avail > 0 ? Math.max(1, Math.floor((avail - gutter) / 8)) : 0;
	return { wrapRef, square, gutter };
}

/**
 * 2D board renderer (BoardRenderer contract). Layers bottom→top: squares, texture,
 * highlights, coordinates, pieces, drag-over, shapes, drag ghost, promotion picker.
 */
export function Board2D(props: BoardRendererProps) {
	const {
		fen,
		orientation,
		dests,
		movable,
		animationMs,
		boardTheme,
		pieceTheme,
		pieceSet,
		input,
		onMove,
		onSelect,
		onDraw,
	} = props;

	const reducedMotion = usePrefersReducedMotion();
	const animMs = reducedMotion ? 0 : Math.max(0, animationMs);
	const { wrapRef, square, gutter } = useBoardSize(props.coordinates);

	const rootRef = useRef<HTMLDivElement>(null);
	const ghostRef = useRef<HTMLDivElement>(null);
	const overRef = useRef<HTMLDivElement>(null);
	const session = useRef<PointerSession | null>(null);
	const drawing = useRef<DrawSession | null>(null);
	const dropSquare = useRef<SquareName | null>(null);

	const [selected, setSelectedState] = useState<SquareName | null>(null);
	const [drag, setDrag] = useState<{ id: string; color: Color; role: Role } | null>(null);
	const [promotion, setPromotion] = useState<{ from: SquareName; to: SquareName; color: Color; dropped: boolean } | null>(null);
	const [pending, setPending] = useState<PendingMove | null>(null);
	const [userShapes, setUserShapes] = useState<{ arrows: Arrow[]; marks: Mark[] }>({ arrows: [], marks: [] });
	const [preview, setPreview] = useState<Arrow | null>(null);
	const [focusSq, setFocusSq] = useState<SquareName | null>(null);
	const [keyboard, setKeyboard] = useState(false);
	const [fading, setFading] = useState<TrackedPiece[]>([]);
	const [, setSpriteTick] = useState(0);

	// ── sprites ──────────────────────────────────────────────────────────
	useEffect(() => {
		let alive = true;
		loadPieceSprite(pieceSet).then(
			() => alive && setSpriteTick((n) => n + 1),
			(err) => console.warn(err),
		);
		return () => {
			alive = false;
		};
	}, [pieceSet.id, pieceSet.sprite]);

	// ── pieces ───────────────────────────────────────────────────────────
	const basePieces = useMemo(() => piecesFromFen(fen), [fen]);
	const activePending = pending && pending.fen === fen ? pending : null;
	const displayPieces = useMemo(
		() => (activePending ? applyOptimisticMove(basePieces, activePending.from, activePending.to, activePending.promotion) : basePieces),
		[basePieces, activePending],
	);
	const tracked = useRef<TrackedPiece[]>([]);
	const diff = useMemo(() => {
		const d = diffPieces(tracked.current, displayPieces);
		tracked.current = d.pieces;
		return d;
	}, [displayPieces]);

	useLayoutEffect(() => {
		if (!diff.removed.length || animMs <= 0) return;
		setFading(diff.removed);
		const t = setTimeout(() => setFading([]), animMs + 60);
		return () => clearTimeout(t);
	}, [diff]);

	// The just-dropped square renders without animation for this position only.
	const instantSquare = dropSquare.current;
	useLayoutEffect(() => {
		dropSquare.current = null;
	}, [diff]);

	// Clear optimistic move once the parent supplies a new FEN (or after a timeout → snap back).
	useEffect(() => {
		if (!pending) return;
		if (pending.fen !== fen) {
			setPending(null);
			return;
		}
		const t = setTimeout(() => setPending(null), PENDING_TIMEOUT_MS);
		return () => clearTimeout(t);
	}, [pending, fen]);

	// Reset selection when the position or movability changes underneath us.
	useEffect(() => {
		selectedRef.current = null;
		setSelectedState(null);
		setPromotion(null);
	}, [fen, movable]);

	const occupied = useMemo(() => new Set(displayPieces.map((p) => p.square)), [displayPieces]);

	// ── helpers ──────────────────────────────────────────────────────────
	const canMove = useCallback(
		(color: Color) => movable === 'both' || movable === color,
		[movable],
	);
	const destsOf = useCallback((sq: SquareName | null) => (sq ? dests.get(sq) ?? [] : []), [dests]);

	const selectedRef = useRef<SquareName | null>(null);
	const setSelected = useCallback(
		(sq: SquareName | null) => {
			if (selectedRef.current === sq) return;
			selectedRef.current = sq;
			setSelectedState(sq);
			onSelect?.(sq);
		},
		[onSelect],
	);

	const commitMove = useCallback(
		(from: SquareName, to: SquareName, promo: PromotionRole | undefined, dropped: boolean) => {
			if (dropped) dropSquare.current = to;
			setPending({ fen, from, to, promotion: promo });
			setSelected(null);
			setPromotion(null);
			onMove(from, to, promo);
		},
		[fen, onMove, setSelected],
	);

	const attemptMove = useCallback(
		(from: SquareName, to: SquareName, dropped: boolean): boolean => {
			if (!destsOf(from).includes(to)) return false;
			const piece = pieceAt(displayPieces, from);
			if (!piece || !canMove(piece.color)) return false;
			const lastRank = piece.color === 'white' ? 7 : 0;
			if (piece.role === 'pawn' && squareToIdx(to).rank === lastRank) {
				if (dropped) dropSquare.current = to;
				setPromotion({ from, to, color: piece.color, dropped });
				return true;
			}
			commitMove(from, to, undefined, dropped);
			return true;
		},
		[destsOf, displayPieces, canMove, commitMove],
	);

	const updateUserShapes = useCallback(
		(next: { arrows: Arrow[]; marks: Mark[] }) => {
			setUserShapes(next);
			onDraw?.(next);
		},
		[onDraw],
	);

	// ── pointer input ────────────────────────────────────────────────────
	const rect = () => rootRef.current!.getBoundingClientRect();

	const placeGhost = (clientX: number, clientY: number) => {
		const el = ghostRef.current;
		const root = rootRef.current;
		if (!el || !root) return;
		const r = root.getBoundingClientRect();
		const sq = r.width / 8;
		el.style.transform = `translate(${clientX - r.left - sq / 2}px, ${clientY - r.top - sq / 2}px)`;
	};

	const placeOver = (sq: SquareName | null) => {
		const el = overRef.current;
		if (!el) return;
		if (!sq) {
			el.style.display = 'none';
			return;
		}
		const c = squareToCell(sq, orientation);
		el.style.display = 'block';
		el.style.transform = `translate(${c.x * 100}%, ${c.y * 100}%)`;
	};

	const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
		if (promotion) return;
		setKeyboard(false);
		const sq = squareFromPoint(e.clientX, e.clientY, rect(), orientation);
		if (!sq) return;

		if (e.button === 2) {
			if (!onDraw) return;
			e.preventDefault();
			drawing.current = { pointerId: e.pointerId, from: sq, to: sq, color: brushFor(e) };
			rootRef.current?.setPointerCapture?.(e.pointerId);
			setPreview({ from: sq, to: sq, color: drawing.current.color });
			return;
		}
		if (e.button !== 0) return;
		if (userShapes.arrows.length || userShapes.marks.length) updateUserShapes({ arrows: [], marks: [] });

		if (selected && sq !== selected && input !== 'drag' && destsOf(selected).includes(sq)) {
			attemptMove(selected, sq, false);
			return;
		}
		const tp = diff.pieces.find((p) => p.square === sq);
		if (tp && movable !== 'none' && canMove(tp.color)) {
			e.preventDefault();
			const wasSelected = selected === sq;
			setSelected(sq);
			session.current = {
				pointerId: e.pointerId,
				square: sq,
				pieceId: tp.id,
				color: tp.color,
				role: tp.role,
				startX: e.clientX,
				startY: e.clientY,
				wasSelected,
				dragging: false,
				touch: e.pointerType === 'touch',
				overSquare: null,
			};
			rootRef.current?.setPointerCapture?.(e.pointerId);
		} else {
			setSelected(null);
		}
	};

	const onPointerMove = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
		const d = drawing.current;
		if (d && d.pointerId === e.pointerId) {
			const sq = squareFromPoint(e.clientX, e.clientY, rect(), orientation);
			if (sq && sq !== d.to) {
				d.to = sq;
				setPreview({ from: d.from, to: sq, color: d.color });
			}
			return;
		}
		const s = session.current;
		if (!s || s.pointerId !== e.pointerId) return;
		if (!s.dragging) {
			if (input === 'click') return;
			const threshold = s.touch ? DRAG_THRESHOLD_TOUCH : DRAG_THRESHOLD_MOUSE;
			if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < threshold) return;
			s.dragging = true;
			placeGhost(e.clientX, e.clientY);
			setDrag({ id: s.pieceId, color: s.color, role: s.role });
		}
		placeGhost(e.clientX, e.clientY);
		const over = squareFromPoint(e.clientX, e.clientY, rect(), orientation);
		if (over !== s.overSquare) {
			s.overSquare = over;
			placeOver(over && over !== s.square && destsOf(s.square).includes(over) ? over : null);
		}
	};

	const endPointer = (e: JSX.TargetedPointerEvent<HTMLDivElement>, cancelled: boolean) => {
		const d = drawing.current;
		if (d && d.pointerId === e.pointerId) {
			drawing.current = null;
			setPreview(null);
			if (cancelled) return;
			if (d.from === d.to) {
				updateUserShapes({ ...userShapes, marks: toggleMark(userShapes.marks, { square: d.from, kind: 'circle', color: d.color }) });
			} else {
				updateUserShapes({ ...userShapes, arrows: toggleArrow(userShapes.arrows, { from: d.from, to: d.to, color: d.color }) });
			}
			return;
		}
		const s = session.current;
		if (!s || s.pointerId !== e.pointerId) return;
		session.current = null;
		placeOver(null);
		if (s.dragging) {
			setDrag(null);
			if (cancelled) return;
			const target = squareFromPoint(e.clientX, e.clientY, rect(), orientation);
			if (target && target !== s.square && attemptMove(s.square, target, true)) return;
			if (target !== s.square) setSelected(null);
			return;
		}
		if (cancelled) return;
		// A click (no drag).
		if (input === 'drag' || s.wasSelected) setSelected(null);
	};

	// ── keyboard ─────────────────────────────────────────────────────────
	const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
		if (promotion) return;
		const start = focusSq ?? selected ?? cellToSquare(0, 7, orientation)!;
		const deltas: Record<string, [number, number]> = {
			ArrowUp: [0, -1],
			ArrowDown: [0, 1],
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
		};
		const delta = deltas[e.key];
		if (delta) {
			e.preventDefault();
			setKeyboard(true);
			setFocusSq(focusSq ? stepSquare(start, delta[0], delta[1], orientation) : start);
			return;
		}
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			setKeyboard(true);
			const sq = start;
			setFocusSq(sq);
			if (selected && sq !== selected && attemptMove(selected, sq, false)) return;
			const p = pieceAt(displayPieces, sq);
			if (p && movable !== 'none' && canMove(p.color)) setSelected(selected === sq ? null : sq);
			else setSelected(null);
			return;
		}
		if (e.key === 'Escape') {
			setSelected(null);
		}
	};

	// ── derived render data ──────────────────────────────────────────────
	const cssVars = useMemo(
		() => ({ ...boardThemeCssVars(boardTheme), ...pieceThemeCssVars(pieceTheme) }),
		[boardTheme, pieceTheme],
	);
	const style: Record<string, string> = { ...cssVars };
	if (square > 0) {
		style.width = `${square * 8}px`;
		style.height = `${square * 8}px`;
		style['--sq'] = `${square}px`;
		if (gutter) style['--coord-gutter'] = `${gutter}px`;
	}

	const selectedDests = props.showLegalDots ? destsOf(selected) : [];
	const allArrows = useMemo(() => [...props.arrows, ...userShapes.arrows], [props.arrows, userShapes.arrows]);
	const allMarks = useMemo(() => [...props.marks, ...userShapes.marks], [props.marks, userShapes.marks]);
	const focusVisible = keyboard ? focusSq : null;

	const focusPiece = focusVisible ? pieceAt(displayPieces, focusVisible) : undefined;
	const announcement = focusVisible
		? `${focusVisible}${focusPiece ? `, ${focusPiece.color} ${ROLE_NAME[focusPiece.role]}` : ', empty'}${selected === focusVisible ? ', selected' : ''}${selected && destsOf(selected).includes(focusVisible) ? ', legal move' : ''}`
		: '';

	const cls = [
		'board',
		`board--${orientation}`,
		`board--coords-${props.coordinates}`,
		`board--texture-${boardTheme.texture.kind}`,
		drag ? 'board--dragging' : '',
		movable !== 'none' ? 'board--interactive' : '',
		props.class ?? '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div ref={wrapRef} class="board-wrap">
			<div
				ref={rootRef}
				class={cls}
				style={style as JSX.CSSProperties}
				tabIndex={0}
				role="application"
				aria-roledescription="chess board"
				aria-label={`Chess board, ${orientation} at the bottom. Use arrow keys to move, Enter to select.`}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={(e) => endPointer(e, false)}
				onPointerCancel={(e) => endPointer(e, true)}
				onLostPointerCapture={(e) => {
					if (session.current?.dragging || drawing.current) endPointer(e, true);
				}}
				onContextMenu={(e) => e.preventDefault()}
				onKeyDown={onKeyDown}
				onBlur={() => setKeyboard(false)}
			>
				<SquaresLayer />
				<TextureLayer texture={boardTheme.texture} />
				<HighlightsLayer
					orientation={orientation}
					lastMove={props.showLastMove ? props.lastMove : undefined}
					selected={selected}
					check={props.showCheck ? props.check : undefined}
					dests={selectedDests}
					occupied={occupied}
					premove={props.premove}
					marks={allMarks}
					focus={focusVisible}
				/>
				<CoordsLayer orientation={orientation} mode={props.coordinates} />
				<PiecesLayer
					set={pieceSet}
					pieces={diff.pieces}
					fading={fading}
					orientation={orientation}
					animationMs={animMs}
					instantSquare={instantSquare}
					dragId={drag?.id ?? null}
				/>
				<div ref={overRef} class="board__drag-over" style={{ display: 'none' }} aria-hidden="true" />
				<ShapesLayer orientation={orientation} arrows={allArrows} marks={allMarks} preview={preview} />
				<div ref={ghostRef} class={`board__ghost${drag ? ' board__ghost--active' : ''}`} aria-hidden="true">
					{drag && (
						<div class={`board__ghost-piece board__piece--${drag.color}`}>
							<PieceGlyph set={pieceSet} color={drag.color} role={drag.role} />
						</div>
					)}
				</div>
				{promotion && (
					<PromotionPicker
						square={promotion.to}
						color={promotion.color}
						orientation={orientation}
						pieceSet={pieceSet}
						onPick={(role) => commitMove(promotion.from, promotion.to, role, promotion.dropped)}
						onCancel={() => {
							dropSquare.current = null;
							setPromotion(null);
							setSelected(null);
							rootRef.current?.focus({ preventScroll: true });
						}}
					/>
				)}
				<div class="board__sr" aria-live="polite">
					{announcement}
				</div>
			</div>
		</div>
	);
}

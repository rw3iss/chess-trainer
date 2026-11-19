// PositionEditor — set up a position square by square (board-image correction, custom setups).
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
	INITIAL_FEN,
	buildFen,
	checkSetup,
	inferCastling,
	placementFromFen,
	placementIndex,
	placementSquare,
	rotatePlacement,
	turnFromFen,
} from '@chess/core/chess';
import type { Color, Piece, Placement, Role, SquareName } from '@chess/core/chess';
import { boardThemeCssVars, pieceThemeCssVars } from '@chess/core/theme';
import type { PieceSetAsset } from '@chess/core/theme';
import { PieceGlyph, isSpriteLoaded, loadPieceSprite } from '@/components/board';
import { Button, Icon, IconButton, Input, Portal, SegmentedControl, Tooltip } from '@/components/common';
import { activeBoardTheme, activePieceSet, activePieceTheme } from '@/state/themes';
import { cx } from '@/lib/classNames';
import { toast } from '@/services/toast';
import './PositionEditor.scss';

// ── constants ───────────────────────────────────────────────────────────

const ROLES: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const ROLE_CHAR: Record<Role, string> = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' };
const CHAR_ROLE: Record<string, Role> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const GLYPH: Record<Role, string> = { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' };
const CASTLING_SIDES = [
	{
		name: 'White',
		rights: [
			{ ch: 'K', label: 'O-O', aria: 'White can castle kingside' },
			{ ch: 'Q', label: 'O-O-O', aria: 'White can castle queenside' },
		],
	},
	{
		name: 'Black',
		rights: [
			{ ch: 'k', label: 'O-O', aria: 'Black can castle kingside' },
			{ ch: 'q', label: 'O-O-O', aria: 'Black can castle queenside' },
		],
	},
] as const;
const TURN_OPTIONS = [
	{ value: 'white' as const, label: 'White' },
	{ value: 'black' as const, label: 'Black' },
];
const DRAG_THRESHOLD = 6;
const EMPTY: Placement = Array.from({ length: 64 }, () => null);

// ── types ───────────────────────────────────────────────────────────────

export interface PositionEditorProps {
	/** Full FEN (controlled). */
	fen: string;
	onChange(fen: string): void;
	/** Squares to flag as uncertain (e.g. low model confidence): subtle dashed outline + listed in a hint. */
	uncertain?: SquareName[];
	/** View orientation (default 'white'). */
	orientation?: Color;
	class?: string;
}

/** Selected palette tool: a piece or the eraser. */
type Tool = { kind: 'piece'; piece: Piece } | { kind: 'erase' };

interface DragState {
	from: { kind: 'square'; index: number } | { kind: 'palette' };
	piece: Piece;
	x0: number;
	y0: number;
	size: number;
	active: boolean;
}

interface Parsed {
	placement: Placement;
	turn: Color;
	castling: string;
	ep: string;
}

// ── helpers ─────────────────────────────────────────────────────────────

function parse(fen: string): Parsed {
	let placement = EMPTY;
	try {
		placement = placementFromFen(fen);
	} catch {
		// keep an empty board; checkSetup reports the error
	}
	const parts = fen.trim().split(/\s+/);
	return { placement, turn: turnFromFen(fen), castling: parts[2] ?? '-', ep: parts[3] ?? '-' };
}

function pieceName(pc: Piece): string {
	return `${pc.color} ${pc.role}`;
}

function samePiece(a: Piece | null, b: Piece): boolean {
	return !!a && a.color === b.color && a.role === b.role;
}

function withSquare(p: Placement, index: number, piece: Piece | null): Placement {
	const out = p.slice();
	out[index] = piece;
	return out;
}

/** Display cell (row-major, top-left first) → placement index for the view orientation. */
function cellIndex(cell: number, orientation: Color): number {
	return orientation === 'white' ? cell : 63 - cell;
}

function squareIndexAt(x: number, y: number): number | null {
	const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
	const sq = el?.closest<HTMLElement>('[data-square-index]');
	return sq ? Number(sq.dataset.squareIndex) : null;
}

// ── piece view ──────────────────────────────────────────────────────────

function PieceView({ piece, set }: { piece: Piece; set: PieceSetAsset | undefined }): JSX.Element {
	return (
		<span class={cx('position-editor__piece', `position-editor__piece--${piece.color}`)} aria-hidden="true">
			{set ? <PieceGlyph set={set} color={piece.color} role={piece.role} /> : <span class="position-editor__glyph">{GLYPH[piece.role]}</span>}
		</span>
	);
}

// ── component ───────────────────────────────────────────────────────────

export function PositionEditor(p: PositionEditorProps): JSX.Element {
	const baseOrientation = p.orientation ?? 'white';
	const [flipped, setFlipped] = useState(false);
	const orientation: Color = flipped ? (baseOrientation === 'white' ? 'black' : 'white') : baseOrientation;
	const [tool, setTool] = useState<Tool>({ kind: 'piece', piece: { color: 'white', role: 'pawn' } });
	const [focusCell, setFocusCell] = useState(0);
	const [touched, setTouched] = useState<ReadonlySet<SquareName>>(new Set());
	const [fenText, setFenText] = useState(p.fen);
	const [fenError, setFenError] = useState<string | undefined>();
	const [ghost, setGhost] = useState<{ x: number; y: number; piece: Piece; size: number } | null>(null);
	const textEmitted = useRef<string | null>(null);
	const drag = useRef<DragState | null>(null);
	const suppressClick = useRef(false);
	const boardRef = useRef<HTMLDivElement>(null);
	const paletteRef = useRef<HTMLDivElement>(null);

	// Themes + sprites (same sources as MiniBoard / GameThumbnail).
	const boardTheme = activeBoardTheme.value;
	const pieceTheme = activePieceTheme.value;
	const pieceSet = activePieceSet.value;
	const [, setTick] = useState(0);
	useEffect(() => {
		if (!pieceSet || isSpriteLoaded(pieceSet.id)) return;
		let alive = true;
		loadPieceSprite(pieceSet).then(
			() => alive && setTick((n) => n + 1),
			() => {},
		);
		return () => {
			alive = false;
		};
	}, [pieceSet?.id]);
	const vars = useMemo(
		() => ({ ...(boardTheme ? boardThemeCssVars(boardTheme) : {}), ...(pieceTheme ? pieceThemeCssVars(pieceTheme) : {}) }),
		[boardTheme, pieceTheme],
	);

	const parsed = useMemo(() => parse(p.fen), [p.fen]);
	const allowed = useMemo(() => inferCastling(parsed.placement), [parsed.placement]);
	const check = useMemo(() => checkSetup(p.fen), [p.fen]);

	// Keep the FEN field in sync with outside changes (not while the user types in it).
	useEffect(() => {
		if (p.fen === textEmitted.current) return;
		setFenText(p.fen);
		setFenError(undefined);
	}, [p.fen]);

	// Uncertain squares come in the parent's coordinates; "Rotate position" maps them along.
	const [rotated, setRotated] = useState(false);
	const uncertainKey = (p.uncertain ?? []).join(',');
	useEffect(() => {
		setTouched(new Set());
		setRotated(false);
	}, [uncertainKey]);
	const uncertainList = useMemo(
		() => (p.uncertain ?? []).map((sq) => (rotated ? placementSquare(63 - placementIndex(sq)) : sq)),
		[uncertainKey, rotated],
	);
	const uncertain = useMemo(() => new Set(uncertainList), [uncertainList]);
	const pending = uncertainList.filter((sq) => !touched.has(sq));

	// ── emitters ────────────────────────────────────────────────────────

	const emit = (placement: Placement, opts: { turn?: Color; castling?: string; ep?: string } = {}): void => {
		textEmitted.current = null;
		p.onChange(
			buildFen(placement, {
				turn: opts.turn ?? parsed.turn,
				castling: 'castling' in opts ? opts.castling : parsed.castling,
				epSquare: opts.ep ?? parsed.ep,
			}),
		);
	};

	const editSquares = (placement: Placement, indices: number[]): void => {
		setTouched((prev) => {
			const next = new Set(prev);
			for (const i of indices) next.add(placementSquare(i));
			return next;
		});
		emit(placement, { ep: '-' });
	};

	const applyTool = (index: number): void => {
		const current = parsed.placement[index];
		if (tool.kind === 'erase') {
			if (current) editSquares(withSquare(parsed.placement, index, null), [index]);
			return;
		}
		const next = samePiece(current, tool.piece) ? null : tool.piece;
		editSquares(withSquare(parsed.placement, index, next), [index]);
	};

	const clearSquare = (index: number): void => {
		if (parsed.placement[index]) editSquares(withSquare(parsed.placement, index, null), [index]);
	};

	const toggleCastling = (ch: string, on: boolean): void => {
		const set = new Set(parsed.castling === '-' ? [] : parsed.castling.split(''));
		if (on) set.add(ch);
		else set.delete(ch);
		emit(parsed.placement, { castling: [...set].join('') || '-' });
	};

	const onFenInput = (value: string): void => {
		setFenText(value);
		let placement: Placement;
		try {
			placement = placementFromFen(value);
		} catch (err) {
			setFenError(err instanceof Error ? err.message : 'Invalid FEN');
			return;
		}
		const parts = value.trim().split(/\s+/);
		if (parts[1] !== undefined && parts[1] !== 'w' && parts[1] !== 'b') {
			setFenError("Invalid FEN: side to move must be 'w' or 'b'");
			return;
		}
		if (parts[2] !== undefined && !/^(-|[KQkq]{1,4})$/.test(parts[2])) {
			setFenError('Invalid FEN: castling must be a KQkq subset or -');
			return;
		}
		setFenError(undefined);
		const fen = buildFen(placement, {
			turn: parts[1] === 'b' ? 'black' : parts[1] === 'w' ? 'white' : parsed.turn,
			castling: parts[2] ?? parsed.castling,
			epSquare: parts[3],
		});
		textEmitted.current = fen;
		p.onChange(fen);
	};

	// ── drag (pointer events) ───────────────────────────────────────────

	const startDrag = (e: JSX.TargetedPointerEvent<HTMLElement>, from: DragState['from'], piece: Piece): void => {
		if (e.button !== 0) return;
		const rect = boardRef.current?.getBoundingClientRect();
		drag.current = { from, piece, x0: e.clientX, y0: e.clientY, size: rect && rect.width ? rect.width / 8 : 48, active: false };
		e.currentTarget.setPointerCapture?.(e.pointerId);
	};

	const moveDrag = (e: JSX.TargetedPointerEvent<HTMLElement>): void => {
		const d = drag.current;
		if (!d) return;
		if (!d.active && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD) return;
		d.active = true;
		setGhost({ x: e.clientX, y: e.clientY, piece: d.piece, size: d.size });
	};

	const endDrag = (e: JSX.TargetedPointerEvent<HTMLElement>): void => {
		const d = drag.current;
		drag.current = null;
		if (!d?.active) return;
		setGhost(null);
		suppressClick.current = true;
		setTimeout(() => (suppressClick.current = false), 0);
		const target = squareIndexAt(e.clientX, e.clientY);
		if (d.from.kind === 'palette') {
			setTool({ kind: 'piece', piece: d.piece });
			if (target !== null) editSquares(withSquare(parsed.placement, target, d.piece), [target]);
			return;
		}
		const src = d.from.index;
		if (target === src) return;
		let next = withSquare(parsed.placement, src, null);
		if (target !== null) next = withSquare(next, target, d.piece);
		editSquares(next, target === null ? [src] : [src, target]);
	};

	const cancelDrag = (): void => {
		drag.current = null;
		setGhost(null);
	};

	// ── keyboard ────────────────────────────────────────────────────────

	const focusBoardCell = (cell: number): void => {
		setFocusCell(cell);
		boardRef.current?.querySelectorAll<HTMLElement>('[data-square-index]')[cell]?.focus();
	};

	const onBoardKey = (e: JSX.TargetedKeyboardEvent<HTMLButtonElement>, cell: number): void => {
		const x = cell % 8;
		const y = Math.floor(cell / 8);
		const moves: Record<string, number | null> = {
			ArrowLeft: x > 0 ? cell - 1 : null,
			ArrowRight: x < 7 ? cell + 1 : null,
			ArrowUp: y > 0 ? cell - 8 : null,
			ArrowDown: y < 7 ? cell + 8 : null,
			Home: y * 8,
			End: y * 8 + 7,
		};
		if (e.key in moves) {
			e.preventDefault();
			const to = moves[e.key];
			if (to !== null && to !== undefined) focusBoardCell(to);
			return;
		}
		const index = cellIndex(cell, orientation);
		if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '-') {
			e.preventDefault();
			clearSquare(index);
			return;
		}
		const role = CHAR_ROLE[e.key.toLowerCase()];
		if (role && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			const piece: Piece = { role, color: e.key === e.key.toUpperCase() ? 'white' : 'black' };
			editSquares(withSquare(parsed.placement, index, piece), [index]);
		}
	};

	// ── palette ─────────────────────────────────────────────────────────

	const tools: { key: string; tool: Tool; label: string }[] = useMemo(() => {
		const out: { key: string; tool: Tool; label: string }[] = [];
		for (const color of ['white', 'black'] as const) {
			for (const role of ROLES) {
				out.push({ key: `${color[0]}${ROLE_CHAR[role]}`, tool: { kind: 'piece', piece: { color, role } }, label: `${color} ${role}` });
			}
		}
		out.push({ key: 'erase', tool: { kind: 'erase' }, label: 'Eraser (empty square)' });
		return out;
	}, []);
	const toolKey = (t: Tool): string => (t.kind === 'erase' ? 'erase' : `${t.piece.color[0]}${ROLE_CHAR[t.piece.role]}`);
	const selectedKey = toolKey(tool);

	const onPaletteKey = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>): void => {
		const current = Math.max(0, tools.findIndex((t) => t.key === selectedKey));
		let next: number | null = null;
		if (e.key === 'ArrowRight') next = (current + 1) % tools.length;
		else if (e.key === 'ArrowLeft') next = (current - 1 + tools.length) % tools.length;
		else if (e.key === 'ArrowDown') next = Math.min(tools.length - 1, current + 6);
		else if (e.key === 'ArrowUp') next = Math.max(0, current - 6);
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = tools.length - 1;
		if (next === null) return;
		e.preventDefault();
		setTool(tools[next].tool);
		paletteRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
	};

	// ── render ──────────────────────────────────────────────────────────

	const cells: JSX.Element[] = [];
	for (let cell = 0; cell < 64; cell++) {
		const index = cellIndex(cell, orientation);
		const sq = placementSquare(index);
		const pc = parsed.placement[index];
		const x = cell % 8;
		const y = Math.floor(cell / 8);
		const light = (x + y) % 2 === 0;
		const flagged = uncertain.has(sq) && !touched.has(sq);
		cells.push(
			<button
				key={sq}
				type="button"
				class={cx('position-editor__square', light ? 'position-editor__square--light' : 'position-editor__square--dark', {
					'position-editor__square--uncertain': flagged,
					'position-editor__square--occupied': !!pc,
				})}
				data-square-index={index}
				tabIndex={cell === focusCell ? 0 : -1}
				aria-label={`${sq}, ${pc ? pieceName(pc) : 'empty'}${flagged ? ', uncertain' : ''}`}
				onClick={() => {
					if (suppressClick.current) return;
					setFocusCell(cell);
					applyTool(index);
				}}
				onContextMenu={(e) => {
					e.preventDefault();
					clearSquare(index);
				}}
				onKeyDown={(e) => onBoardKey(e, cell)}
				onPointerDown={pc ? (e) => startDrag(e, { kind: 'square', index }, pc) : undefined}
				onPointerMove={moveDrag}
				onPointerUp={endDrag}
				onPointerCancel={cancelDrag}
			>
				{pc && <PieceView piece={pc} set={pieceSet} />}
				{x === 0 && <span class="position-editor__coord position-editor__coord--rank">{sq[1]}</span>}
				{y === 7 && <span class="position-editor__coord position-editor__coord--file">{sq[0]}</span>}
			</button>,
		);
	}

	const castlingOn = parsed.castling === '-' ? '' : parsed.castling;

	return (
		<div class={cx('position-editor', p.class)} style={vars as JSX.CSSProperties}>
			<div ref={boardRef} class="position-editor__board" role="group" aria-label="Board editor">
				{cells}
			</div>

			<div
				ref={paletteRef}
				class="position-editor__palette"
				role="radiogroup"
				aria-label="Piece to place"
				onKeyDown={onPaletteKey}
			>
				{tools.map((t) => {
					const checked = t.key === selectedKey;
					return (
						<button
							key={t.key}
							type="button"
							role="radio"
							aria-checked={checked}
							aria-label={t.label}
							title={t.label}
							tabIndex={checked ? 0 : -1}
							class={cx('position-editor__tool', { 'position-editor__tool--active': checked, 'position-editor__tool--erase': t.tool.kind === 'erase' })}
							onClick={() => {
								if (suppressClick.current) return;
								setTool(t.tool);
							}}
							onPointerDown={t.tool.kind === 'piece' ? (e) => startDrag(e, { kind: 'palette' }, (t.tool as { piece: Piece }).piece) : undefined}
							onPointerMove={moveDrag}
							onPointerUp={endDrag}
							onPointerCancel={cancelDrag}
						>
							{t.tool.kind === 'piece' ? <PieceView piece={t.tool.piece} set={pieceSet} /> : <Icon name="trash" size={18} />}
						</button>
					);
				})}
			</div>

			<div class="position-editor__controls">
				<div class="position-editor__row">
					<span class="position-editor__label">To move</span>
					<SegmentedControl
						size="sm"
						ariaLabel="Side to move"
						options={TURN_OPTIONS}
						value={parsed.turn}
						onChange={(turn) => emit(parsed.placement, { turn, ep: '-' })}
					/>
				</div>
				<fieldset class="position-editor__castling">
					<legend class="position-editor__label">Castling</legend>
					<div class="position-editor__castling-sides">
						{CASTLING_SIDES.map((side) => (
							<div key={side.name} class="position-editor__castling-side">
								<span class="position-editor__side-name" aria-hidden="true">
									{side.name}
								</span>
								{side.rights.map((r) => {
									const possible = allowed.includes(r.ch);
									return (
										<label key={r.ch} class={cx('position-editor__check', { 'position-editor__check--disabled': !possible })}>
											<input
												type="checkbox"
												checked={possible && castlingOn.includes(r.ch)}
												disabled={!possible}
												aria-label={r.aria}
												onChange={(e) => toggleCastling(r.ch, e.currentTarget.checked)}
											/>
											<span aria-hidden="true">{r.label}</span>
										</label>
									);
								})}
							</div>
						))}
					</div>
				</fieldset>
				<div class="position-editor__actions">
					<IconButton icon="flip" label="Flip view" size="sm" active={flipped} onClick={() => setFlipped((f) => !f)} />
					<Tooltip content="Turn the position 180° (for a board image read upside down). Pieces move; the view does not.">
						<Button
							size="sm"
							variant="secondary"
							onClick={() => {
								setRotated((r) => !r);
								setTouched((prev) => new Set([...prev].map((sq) => placementSquare(63 - placementIndex(sq)))));
								emit(rotatePlacement(parsed.placement), { castling: undefined, ep: '-' });
							}}
						>
							Rotate position
						</Button>
					</Tooltip>
					<Button size="sm" variant="ghost" onClick={() => emit(EMPTY, { castling: '-', ep: '-' })}>
						Clear board
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							textEmitted.current = null;
							p.onChange(INITIAL_FEN);
						}}
					>
						Start position
					</Button>
				</div>
			</div>

			<Input
				class="position-editor__fen"
				label="FEN"
				value={fenText}
				error={fenError}
				spellcheck={false}
				autocomplete="off"
				onInput={(e) => onFenInput(e.currentTarget.value)}
				trailing={
					<Tooltip content="Copy FEN" placement="top">
						<IconButton
							icon="copy"
							label="Copy FEN"
							size="sm"
							class="position-editor__copy"
							onClick={() =>
								navigator.clipboard.writeText(fenText.trim()).then(
									() => toast.success('FEN copied'),
									() => toast.error('Copy failed — select the FEN and copy it.'),
								)
							}
						/>
					</Tooltip>
				}
			/>

			{pending.length > 0 && (
				<p class="position-editor__hint">
					<Icon name="info" size={16} />
					<span>Check the outlined squares: {pending.join(', ')}</span>
				</p>
			)}

			{!check.ok && (
				<ul class="position-editor__errors" role="alert">
					{check.errors.map((err) => (
						<li key={err}>
							<Icon name="warning" size={14} />
							{err}
						</li>
					))}
				</ul>
			)}

			{ghost && (
				<Portal>
					<div
						class="position-editor__ghost"
						aria-hidden="true"
						style={{
							...vars,
							width: `${ghost.size}px`,
							height: `${ghost.size}px`,
							transform: `translate(${ghost.x - ghost.size / 2}px, ${ghost.y - ghost.size / 2}px)`,
						} as JSX.CSSProperties}
					>
						<PieceView piece={ghost.piece} set={pieceSet} />
					</div>
				</Portal>
			)}
		</div>
	);
}

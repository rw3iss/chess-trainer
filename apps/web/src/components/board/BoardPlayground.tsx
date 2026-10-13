import { useMemo, useState } from 'preact/hooks';
import { INITIAL_FEN, applyUci, legalDests, makeUci, positionStatus } from '@chess/core';
import type { Color, PromotionRole, SquareName } from '@chess/core';
import { BUILTIN_BOARD_THEMES, BUILTIN_PIECE_SETS, BUILTIN_PIECE_THEMES } from '@chess/core/theme';
import type { BoardTextureKind, BoardTheme, PieceSideColors, PieceTheme } from '@chess/core/theme';
import { Board2D } from './Board2D';
import { MiniBoard } from './MiniBoard';
import { EvalBar } from './EvalBar';
import type { Arrow, BoardViewModel, Mark } from './types';
import './BoardPlayground.scss';

const TEXTURES: BoardTextureKind[] = ['none', 'gradient', 'wood', 'marble', 'slate', 'felt', 'paper'];
const SAMPLE_FENS = [
	'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
	'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5',
	'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
	'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
];

export interface BoardPlaygroundProps {
	/** Initial board theme id. */
	boardThemeId?: string;
	/** Initial piece theme id. */
	pieceThemeId?: string;
	/** Initial FEN. */
	fen?: string;
}

function ColorRow({ label, value, onChange }: { label: string; value: PieceSideColors; onChange(v: PieceSideColors): void }) {
	return (
		<div class="board-playground__colors">
			<span class="board-playground__label">{label}</span>
			{(['body', 'line', 'accent'] as const).map((k) => (
				<label key={k} class="board-playground__swatch" title={`${label} ${k}`}>
					<input type="color" value={toHex(value[k])} onInput={(e) => onChange({ ...value, [k]: e.currentTarget.value })} />
					<span>{k}</span>
				</label>
			))}
		</div>
	);
}

function toHex(c: string): string {
	if (/^#[0-9a-f]{6}$/i.test(c)) return c;
	if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((h) => h + h).join('');
	return '#888888';
}

/** Dev harness for the board: themes, piece sets, colours, options. Not routed. */
export function BoardPlayground(props: BoardPlaygroundProps) {
	const [fen, setFen] = useState(props.fen ?? INITIAL_FEN);
	const [lastMove, setLastMove] = useState<[SquareName, SquareName] | undefined>();
	const [boardTheme, setBoardTheme] = useState<BoardTheme>(
		() => BUILTIN_BOARD_THEMES.find((t) => t.id === props.boardThemeId) ?? BUILTIN_BOARD_THEMES[0],
	);
	const [pieceTheme, setPieceTheme] = useState<PieceTheme>(
		() => BUILTIN_PIECE_THEMES.find((t) => t.id === props.pieceThemeId) ?? BUILTIN_PIECE_THEMES[0],
	);
	const [orientation, setOrientation] = useState<Color>('white');
	const [coordinates, setCoordinates] = useState<BoardViewModel['coordinates']>('inside');
	const [input, setInput] = useState<BoardViewModel['input']>('both');
	const [animationMs, setAnimationMs] = useState(180);
	const [drawn, setDrawn] = useState<{ arrows: Arrow[]; marks: Mark[] }>({ arrows: [], marks: [] });

	const pieceSet = BUILTIN_PIECE_SETS.find((s) => s.id === pieceTheme.assetId) ?? BUILTIN_PIECE_SETS[0];
	const dests = useMemo(() => legalDests(fen), [fen]);
	const status = useMemo(() => positionStatus(fen), [fen]);

	if (!pieceSet) return <p class="board-playground__empty">No piece sets built yet — run pnpm assets:pieces.</p>;

	const onMove = (from: SquareName, to: SquareName, promotion?: PromotionRole) => {
		const res = applyUci(fen, makeUci(from, to, promotion));
		if (!res) return;
		setFen(res.fen);
		setLastMove([from, to]);
	};

	const setTexture = (patch: Partial<BoardTheme['texture']>) =>
		setBoardTheme({ ...boardTheme, texture: { ...boardTheme.texture, ...patch } });

	return (
		<div class="board-playground">
			<div class="board-playground__stage">
				<div class="board-playground__eval">
					<EvalBar whiteProb={0.62} label="+0.8" orientation={orientation} />
				</div>
				<div class="board-playground__board">
					<Board2D
						fen={fen}
						orientation={orientation}
						lastMove={lastMove}
						check={status.checkSquare}
						dests={dests}
						movable="both"
						arrows={[{ from: 'g1', to: 'f3', opacity: 0.55 }]}
						marks={[]}
						animationMs={animationMs}
						coordinates={coordinates}
						showLegalDots
						showLastMove
						showCheck
						input={input}
						onMove={onMove}
						onDraw={setDrawn}
						boardTheme={boardTheme}
						pieceTheme={pieceTheme}
						pieceSet={pieceSet}
					/>
				</div>
			</div>

			<aside class="board-playground__panel">
				<label class="board-playground__field">
					<span class="board-playground__label">Board</span>
					<select value={boardTheme.id} onChange={(e) => setBoardTheme(BUILTIN_BOARD_THEMES.find((t) => t.id === e.currentTarget.value)!)}>
						{BUILTIN_BOARD_THEMES.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
				</label>
				<div class="board-playground__colors">
					<span class="board-playground__label">Squares</span>
					<label class="board-playground__swatch">
						<input type="color" value={toHex(boardTheme.light)} onInput={(e) => setBoardTheme({ ...boardTheme, light: e.currentTarget.value })} />
						<span>light</span>
					</label>
					<label class="board-playground__swatch">
						<input type="color" value={toHex(boardTheme.dark)} onInput={(e) => setBoardTheme({ ...boardTheme, dark: e.currentTarget.value })} />
						<span>dark</span>
					</label>
				</div>
				<label class="board-playground__field">
					<span class="board-playground__label">Texture</span>
					<select value={boardTheme.texture.kind} onChange={(e) => setTexture({ kind: e.currentTarget.value as BoardTextureKind })}>
						{TEXTURES.map((k) => (
							<option key={k} value={k}>
								{k}
							</option>
						))}
					</select>
				</label>
				<label class="board-playground__field">
					<span class="board-playground__label">Intensity {boardTheme.texture.intensity.toFixed(2)}</span>
					<input type="range" min={0} max={1} step={0.05} value={boardTheme.texture.intensity} onInput={(e) => setTexture({ intensity: +e.currentTarget.value })} />
				</label>
				<label class="board-playground__field">
					<span class="board-playground__label">Scale {boardTheme.texture.scale.toFixed(2)}</span>
					<input type="range" min={0.3} max={3} step={0.1} value={boardTheme.texture.scale} onInput={(e) => setTexture({ scale: +e.currentTarget.value })} />
				</label>

				<label class="board-playground__field">
					<span class="board-playground__label">Pieces</span>
					<select value={pieceTheme.id} onChange={(e) => setPieceTheme(BUILTIN_PIECE_THEMES.find((t) => t.id === e.currentTarget.value)!)}>
						{BUILTIN_PIECE_THEMES.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
				</label>
				<ColorRow label="White" value={pieceTheme.colors.white} onChange={(v) => setPieceTheme({ ...pieceTheme, colors: { ...pieceTheme.colors, white: v } })} />
				<ColorRow label="Black" value={pieceTheme.colors.black} onChange={(v) => setPieceTheme({ ...pieceTheme, colors: { ...pieceTheme.colors, black: v } })} />
				<label class="board-playground__field">
					<span class="board-playground__label">Shading {pieceTheme.shading.toFixed(2)}</span>
					<input type="range" min={0} max={1} step={0.05} value={pieceTheme.shading} onInput={(e) => setPieceTheme({ ...pieceTheme, shading: +e.currentTarget.value })} />
				</label>
				<label class="board-playground__field">
					<span class="board-playground__label">Shadow {pieceTheme.shadow.toFixed(2)}</span>
					<input type="range" min={0} max={1} step={0.05} value={pieceTheme.shadow} onInput={(e) => setPieceTheme({ ...pieceTheme, shadow: +e.currentTarget.value })} />
				</label>

				<div class="board-playground__row">
					<button type="button" onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')}>
						Flip
					</button>
					<button
						type="button"
						onClick={() => {
							setFen(INITIAL_FEN);
							setLastMove(undefined);
						}}
					>
						Reset
					</button>
					<select value={coordinates} onChange={(e) => setCoordinates(e.currentTarget.value as BoardViewModel['coordinates'])}>
						<option value="inside">coords inside</option>
						<option value="outside">coords outside</option>
						<option value="none">no coords</option>
					</select>
					<select value={input} onChange={(e) => setInput(e.currentTarget.value as BoardViewModel['input'])}>
						<option value="both">drag + click</option>
						<option value="drag">drag</option>
						<option value="click">click</option>
					</select>
				</div>
				<label class="board-playground__field">
					<span class="board-playground__label">Animation {animationMs}ms</span>
					<input type="range" min={0} max={600} step={20} value={animationMs} onInput={(e) => setAnimationMs(+e.currentTarget.value)} />
				</label>
				<p class="board-playground__hint">
					Right-drag draws arrows (shift = red, alt = blue). Drawn: {drawn.arrows.length} arrows, {drawn.marks.length} circles.
				</p>

				<div class="board-playground__minis">
					{SAMPLE_FENS.map((f) => (
						<button key={f} type="button" class="board-playground__mini" onClick={() => setFen(f)} aria-label="Load position">
							<MiniBoard fen={f} boardTheme={boardTheme} pieceTheme={pieceTheme} pieceSet={pieceSet} />
						</button>
					))}
				</div>
			</aside>
		</div>
	);
}

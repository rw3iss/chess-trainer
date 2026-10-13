// BoardStage — the persistent hero board (PLAN §4.1). Mounted once by AppShell;
// never unmounts across routes, so playback/bots/clocks keep running.
// THE single integration point with '@/components/board' (Board2D, MiniBoard).
import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { makeUci, positionStatus, turnFromFen, type Color, type PromotionRole, type SquareName } from '@chess/core/chess';
import { activeResult, createSession, type Session } from '@chess/core/game';
import { Board2D, MiniBoard, type Arrow, type Mark } from '@/components/board';
import { Badge } from '@/components/common/Badge';
import { Icon } from '@/components/common/Icon';
import { activeSession, sessionsActions } from '@/state/sessions';
import { settings } from '@/state/settings';
import { activeBoardTheme, activePieceSet, activePieceTheme } from '@/state/themes';
import type { PieceSetAsset, PieceTheme } from '@chess/core/theme';
import { cx } from '@/lib/classNames';
import { boardViewModel, lastMoveOf, playerLabel } from './boardModel';
import { fromMoveHandlers, stageShapes, stageSlots } from './slots';
import { CapturedPieces } from './CapturedPieces';
import './BoardStage.scss';

const MODE_LABEL: Record<Session['mode'], string> = {
	analysis: 'Analysis',
	bot: 'vs Bot',
	'local-pvp': 'Local',
	online: 'Online',
};

interface PlayerStripProps {
	session: Session;
	color: Color;
	position: 'top' | 'bottom';
	toMove: boolean;
	fen: string;
	pieceSet: PieceSetAsset;
	pieceTheme: PieceTheme;
}

function PlayerStrip({ session, color, position, toMove, fen, pieceSet, pieceTheme }: PlayerStripProps): JSX.Element {
	const Slot = position === 'top' ? stageSlots.clockTop.Render : stageSlots.clockBottom.Render;
	return (
		<div class={cx('player-strip', `player-strip--${position}`, toMove && 'player-strip--to-move')}>
			<span class={cx('player-strip__swatch', `player-strip__swatch--${color}`)} aria-hidden="true" />
			<span class="player-strip__name">{fromMoveHandlers((h) => h.playerLabel?.(session, color)) ?? playerLabel(session, color)}</span>
			{toMove && <span class="player-strip__turn">to move</span>}
			{position === 'top' && (
				<Badge tone={session.mode === 'analysis' ? 'neutral' : 'accent'} class="player-strip__mode">
					{MODE_LABEL[session.mode]}
				</Badge>
			)}
			<CapturedPieces fen={fen} color={color} pieceSet={pieceSet} pieceTheme={pieceTheme} />
			<span class="player-strip__slot">
				<Slot session={session} color={color} />
			</span>
		</div>
	);
}

function ResultBanner({ session }: { session: Session }): JSX.Element | null {
	// Only on the final position: stepping back hides it so play can continue from there.
	const r = activeResult(session);
	if (!r) return null;
	const text = r.winner ? `${r.winner === 'white' ? 'White' : 'Black'} wins` : 'Draw';
	return (
		<div class="stage__result" role="status">
			<span class="stage__result-title">{text}</span>
			<span class="stage__result-reason">by {r.reason.replace('-', ' ')}</span>
		</div>
	);
}

export function BoardStage({ class: className }: { class?: string }): JSX.Element {
	const active = activeSession.value;
	// No open session: show a fresh position; the first move opens a real session.
	const ghost = useMemo(() => createSession({ id: 'ghost' }), []);
	const session = active ?? ghost;
	const s = settings.value;
	const boardTheme = activeBoardTheme.value;
	const pieceTheme = activePieceTheme.value;
	const pieceSet = activePieceSet.value;
	// User-drawn shapes are ephemeral and tied to the current position.
	const [shapes, setShapes] = useState<{ key: string; arrows: Arrow[]; marks: Mark[] }>({ key: '', arrows: [], marks: [] });

	if (!boardTheme || !pieceTheme || !pieceSet) {
		return (
			<section class={cx('stage', className)} aria-label="Board">
				<div class="stage__area">
					<div class="stage__column">
						<div class="stage__board stage__board--empty" />
					</div>
				</div>
			</section>
		);
	}

	const vm = boardViewModel(session, s.board, active ? fromMoveHandlers((h) => h.movable?.(active)) : undefined);
	const external = Object.values(stageShapes.value).reduce(
		(acc, x) => ({ arrows: [...acc.arrows, ...x.arrows], marks: [...acc.marks, ...x.marks] }),
		{ arrows: [] as Arrow[], marks: [] as Mark[] },
	);
	const shapeKey = `${session.id}:${session.cursor}`;
	const turn = turnFromFen(vm.fen);
	const top: Color = session.orientation === 'white' ? 'black' : 'white';
	const bottom: Color = session.orientation;
	const over = positionStatus(vm.fen).outcome !== undefined || !!activeResult(session);

	const onMove = (from: SquareName, to: SquareName, promotion?: PromotionRole) => {
		const uci = makeUci(from, to, promotion);
		// A feature (e.g. online play) may take over the move instead of applying it locally.
		if (active && fromMoveHandlers((h) => (h.onMove?.(active, uci) ? true : undefined))) return;
		const target = active ?? sessionsActions.newSession();
		sessionsActions.move(uci, target.id);
	};

	return (
		<section class={cx('stage', className)} aria-label="Board">
			<div class="stage__area">
				<div class="stage__evalbar">
					<stageSlots.evalBar.Render session={session} />
				</div>
				<div class="stage__column">
					<PlayerStrip session={session} color={top} position="top" toMove={!over && turn === top} fen={vm.fen} pieceSet={pieceSet} pieceTheme={pieceTheme} />
					<div class="stage__board">
						<Board2D
							{...vm}
							arrows={[...external.arrows, ...(shapes.key === shapeKey ? shapes.arrows : [])]}
							marks={[...external.marks, ...(shapes.key === shapeKey ? shapes.marks : [])]}
							boardTheme={boardTheme}
							pieceTheme={pieceTheme}
							pieceSet={pieceSet}
							onMove={onMove}
							onDraw={(d) => setShapes({ key: shapeKey, ...d })}
						/>
						<div class="stage__overlay">
							<ResultBanner session={session} />
							<stageSlots.overlay.Render session={session} />
						</div>
					</div>
					<PlayerStrip session={session} color={bottom} position="bottom" toMove={!over && turn === bottom} fen={vm.fen} pieceSet={pieceSet} pieceTheme={pieceTheme} />
				</div>
				<div class="stage__side">
					<stageSlots.side.Render session={session} />
				</div>
			</div>
		</section>
	);
}

export interface StageMiniBoardProps {
	session: Session;
	size?: number | string;
	class?: string;
}

/** Mini board for a session (session cards, "now playing" chip). Uses the active themes. */
export function StageMiniBoard({ session, size, class: className }: StageMiniBoardProps): JSX.Element {
	const boardTheme = activeBoardTheme.value;
	const pieceTheme = activePieceTheme.value;
	const pieceSet = activePieceSet.value;
	const fen = session.tree.nodes[session.cursor]?.fen ?? '';
	if (!boardTheme || !pieceTheme || !pieceSet) {
		return (
			<span class={cx('stage-mini--fallback', className)} aria-hidden="true">
				<Icon name="board" />
			</span>
		);
	}
	return (
		<MiniBoard
			fen={fen}
			orientation={session.orientation}
			boardTheme={boardTheme}
			pieceTheme={pieceTheme}
			pieceSet={pieceSet}
			lastMove={lastMoveOf(session)}
			size={size}
			class={className}
			label={session.title}
		/>
	);
}

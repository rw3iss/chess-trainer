// RoomView — the in-room panel: header + share link, players & clocks, status,
// game actions (resign / draw offer & answer), move list and chat.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import type { Session } from '@chess/core/game';
import { Badge, Button, Modal, type BadgeTone } from '@/components/common';
import { MoveList, type MoveListActions } from '@/components/moves/MoveList';
import { toast } from '@/services/toast';
import type { ConnectionStatus } from '@/services/realtime';
import { authUser } from '@/state/auth';
import { currentRoom, isMyTurn, myColor, mySeat, pendingMove, roomChat, roomConnection, roomError, roomsActions } from '@/state/rooms';
import { sessionsActions } from '@/state/sessions';
import { ChatPanel } from './ChatPanel';
import { RoomPlayers } from './RoomPlayers';
import { ShareLink } from './ShareLink';
import './RoomView.scss';

const CONNECTION: Record<ConnectionStatus, { label: string; tone: BadgeTone }> = {
	idle: { label: 'Offline', tone: 'neutral' },
	connecting: { label: 'Connecting', tone: 'info' },
	connected: { label: 'Live', tone: 'success' },
	reconnecting: { label: 'Reconnecting', tone: 'warn' },
	error: { label: 'Disconnected', tone: 'danger' },
};

const REASON: Record<string, string> = {
	checkmate: 'checkmate',
	stalemate: 'stalemate',
	resign: 'resignation',
	timeout: 'timeout',
	agreement: 'agreement',
	'insufficient-material': 'insufficient material',
	'fifty-move': 'the 50-move rule',
	threefold: 'threefold repetition',
};

function statusText(): string {
	const room = currentRoom.value!;
	const me = myColor.value;
	if (room.result) {
		const r = room.result;
		const reason = REASON[r.reason] ?? r.reason.replace(/-/g, ' ');
		if (!r.winner) return `Draw by ${reason}.`;
		if (me) return `${r.winner === me ? 'You won' : 'You lost'} by ${reason}.`;
		return `${r.winner === 'white' ? 'White' : 'Black'} won by ${reason}.`;
	}
	if (!room.players.white || !room.players.black) return 'Waiting for an opponent — share the link.';
	if (!me) return 'You are watching this game.';
	if (pendingMove.value) return 'Sending move…';
	return isMyTurn.value ? 'Your move.' : 'Opponent to move.';
}

export function RoomView({ session }: { session: Session | null }): JSX.Element {
	const { route } = useLocation();
	const [confirmResign, setConfirmResign] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	// The panel keeps its scroll position across routes (e.g. a long lobby) — start at the top.
	useEffect(() => {
		let el = rootRef.current?.parentElement ?? null;
		while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
		if (el && el !== document.documentElement && el !== document.body) el.scrollTop = 0;
	}, []);
	const room = currentRoom.value!;
	const me = myColor.value;
	const playing = !!me && !room.result && !!room.players.white && !!room.players.black;
	const conn = CONNECTION[roomConnection.value];
	const drawFrom = room.drawOfferFrom;
	const selfId = authUser.value?.id ?? (me ? (room.players[me]?.userId ?? null) : null);

	const actions: MoveListActions = {
		goto: (id) => session && sessionsActions.goto(id, session.id),
		fork: (id) => {
			if (session && sessionsActions.fork(session.id, id)) toast.info('Forked into an analysis session', { id: 'fork' });
		},
		deleteFrom: () => undefined,
		promote: () => undefined,
		editNote: () => undefined,
	};

	const leave = async () => {
		await roomsActions.leave();
		route('/play/new');
	};

	return (
		<div class="room-view" ref={rootRef}>
			<header class="room-view__header">
				<div class="room-view__heading">
					<span class="room-view__eyebrow">{mySeat.value === 'spectator' ? 'Spectating' : 'Online game'}</span>
					<h1 class="room-view__title">{room.name}</h1>
				</div>
				<Badge tone={conn.tone} title={`Connection: ${conn.label}`}>
					{conn.label}
				</Badge>
			</header>

			{(!room.players.white || !room.players.black) && !room.result && (
				<div class="room-view__share">
					<span class="room-view__share-label">Invite your opponent</span>
					<ShareLink roomId={room.id} />
				</div>
			)}

			<RoomPlayers room={room} clock={session?.clock} me={me} orientation={session?.orientation ?? 'white'} />

			<p class={`room-view__status${room.result ? ' room-view__status--over' : isMyTurn.value ? ' room-view__status--turn' : ''}`} role="status">
				{statusText()}
			</p>

			{roomError.value && (
				<p class="room-view__error" role="alert">
					{roomError.value}
					<button type="button" class="room-view__error-close" onClick={() => roomsActions.clearError()} aria-label="Dismiss">
						×
					</button>
				</p>
			)}

			{playing && drawFrom && drawFrom !== me && (
				<div class="room-view__offer" role="alert">
					<span>Your opponent offers a draw.</span>
					<div class="room-view__offer-actions">
						<Button size="sm" variant="primary" onClick={() => void roomsActions.answerDraw(true)}>
							Accept
						</Button>
						<Button size="sm" variant="ghost" onClick={() => void roomsActions.answerDraw(false)}>
							Decline
						</Button>
					</div>
				</div>
			)}

			{playing && (
				<div class="room-view__actions">
					<Button size="sm" variant="secondary" icon="minus" disabled={drawFrom === me} onClick={() => void roomsActions.offerDraw()}>
						{drawFrom === me ? 'Draw offered' : 'Offer draw'}
					</Button>
					<Button size="sm" variant="danger" icon="close" onClick={() => setConfirmResign(true)}>
						Resign
					</Button>
				</div>
			)}

			{session && session.tree.nodes[session.tree.rootId]!.children.length > 0 && (
				<div class="room-view__moves">
					<MoveList session={session} actions={actions} />
				</div>
			)}

			<ChatPanel messages={roomChat.value} selfId={selfId} onSend={(t) => void roomsActions.chat(t)} disabled={roomConnection.value !== 'connected'} />

			<footer class="room-view__footer">
				<ShareLink roomId={room.id} />
				<Button size="sm" variant="ghost" icon="chevron-left" onClick={() => void leave()}>
					Leave room
				</Button>
			</footer>

			<Modal
				open={confirmResign}
				onClose={() => setConfirmResign(false)}
				title="Resign this game?"
				description="Your opponent will be awarded the win."
				size="sm"
				footer={
					<>
						<Button variant="ghost" onClick={() => setConfirmResign(false)}>
							Keep playing
						</Button>
						<Button
							variant="danger"
							onClick={() => {
								setConfirmResign(false);
								void roomsActions.resign();
							}}
						>
							Resign
						</Button>
					</>
				}
			/>
		</div>
	);
}

// Play page — `/play/new` (lobby: create / join) and `/play/:roomId` (in-room view).
// Online play needs the optional server; when it is unreachable the page explains why.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation, useRoute } from 'preact-iso';
import { Button, EmptyState, Spinner } from '@/components/common';
import { GuestNameField, PlayLobby, PlayUnavailable, RoomView, registerOnlineStage } from '@/components/play';
import { serverConnector } from '@/services/server';
import { guestName, isLoggedIn } from '@/state/auth';
import { currentRoom, roomError, roomJoining, roomSessionId, roomsActions, roomsAvailable } from '@/state/rooms';
import { getSession, sessionsActions } from '@/state/sessions';
import './Play.scss';

registerOnlineStage();

function JoinGate({ roomId }: { roomId: string }): JSX.Element {
	const { route } = useLocation();
	const [asked, setAsked] = useState(false);
	const canAutoJoin = isLoggedIn.value || !!guestName.value;

	useEffect(() => {
		if (canAutoJoin && !asked) {
			setAsked(true);
			void roomsActions.join(roomId).catch(() => undefined);
		}
	}, [roomId, canAutoJoin, asked]);

	if (roomJoining.value || (canAutoJoin && !asked)) {
		return (
			<div class="play-page__center">
				<Spinner label="Joining room" />
				<span class="play-page__muted">Joining room…</span>
			</div>
		);
	}
	if (asked && roomError.value) {
		return (
			<EmptyState icon="warning" title="Could not join" description={roomError.value}>
				<Button variant="secondary" onClick={() => void roomsActions.join(roomId).catch(() => undefined)}>
					Try again
				</Button>
				<Button variant="ghost" onClick={() => route('/play/new')}>
					Back to lobby
				</Button>
			</EmptyState>
		);
	}
	return (
		<form
			class="play-page__join"
			onSubmit={(e) => {
				e.preventDefault();
				setAsked(true);
				void roomsActions.join(roomId).catch(() => undefined);
			}}
		>
			<span class="play-page__eyebrow">You're invited</span>
			<h1 class="play-page__title">Join this game</h1>
			<GuestNameField />
			<Button variant="primary" size="lg" block type="submit">
				Join room
			</Button>
		</form>
	);
}

export default function Play(): JSX.Element {
	const { params } = useRoute();
	const roomId = params.roomId && params.roomId !== 'new' ? params.roomId : null;
	const room = currentRoom.value;
	const inRoom = !!roomId && room?.id === roomId;
	const session = inRoom ? getSession(roomSessionId.value) : null;

	// Keep the room's session on the board while this page is open.
	useEffect(() => {
		if (session) sessionsActions.setActive(session.id);
	}, [session?.id]);

	if (!roomId) return <PlayLobby />;
	if (inRoom) return <RoomView session={session} />;
	if (!roomsAvailable.value) {
		if (serverConnector.lastCheckedAt.value === null || serverConnector.checking.value) {
			return (
				<div class="play-page__center">
					<Spinner label="Checking the server" />
				</div>
			);
		}
		return (
			<div class="play-page">
				<PlayUnavailable />
			</div>
		);
	}
	return (
		<div class="play-page">
			<JoinGate key={roomId} roomId={roomId} />
		</div>
	);
}

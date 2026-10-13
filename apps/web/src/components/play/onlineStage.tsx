// Wires online rooms into the persistent BoardStage (once, idempotent):
//  - the board is movable only for my seat, on my turn, at the live position;
//  - a move on an online session is sent to the server instead of being applied;
//  - player strips show the room's player names;
//  - clocks: if no clock component is registered in the stage slots, OnlineClock is.
import type { Color } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import { lineEnd } from '@chess/core/chess';
import { setStageMoveHandler, stageSlots, type StageSlotProps } from '@/components/stage/slots';
import { currentRoom, isMyTurn, myColor, pendingMove, roomSessionId, roomsActions } from '@/state/rooms';
import { OnlineClock } from './OnlineClock';

let registered = false;

function isRoomSession(session: Session): boolean {
	return session.mode === 'online' && session.id === roomSessionId.value;
}

function StripClock({ session, color }: StageSlotProps) {
	return session.mode === 'online' && session.clock ? <OnlineClock clock={session.clock} color={color} size="sm" /> : null;
}

export function registerOnlineStage(): void {
	if (registered) return;
	registered = true;
	setStageMoveHandler('online', {
		movable: (session) => {
			if (session.mode !== 'online') return undefined;
			if (!isRoomSession(session) || !isMyTurn.value || pendingMove.value) return 'none';
			// Only at the live position (not while browsing earlier moves).
			if (lineEnd(session.tree, session.tree.rootId) !== session.cursor) return 'none';
			return myColor.value ?? 'none';
		},
		onMove: (session, uci) => {
			if (session.mode !== 'online') return false;
			if (isRoomSession(session)) void roomsActions.move(uci);
			return true;
		},
		playerLabel: (session, color: Color) => {
			if (session.mode !== 'online') return undefined;
			const room = currentRoom.value;
			if (!room || room.id !== session.source.roomId) return undefined;
			const p = room.players[color];
			const name = p?.displayName ?? 'Waiting…';
			return myColor.value === color ? `${name} (you)` : name;
		},
	});
	if (!stageSlots.clockTop.has()) stageSlots.clockTop.register(StripClock);
	if (!stageSlots.clockBottom.has()) stageSlots.clockBottom.register(StripClock);
}

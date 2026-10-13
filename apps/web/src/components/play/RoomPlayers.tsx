// RoomPlayers — both seats (name, presence, clock, "you"), turn marker and spectator count.
import type { JSX } from 'preact';
import { turnFromFen, type Color } from '@chess/core/chess';
import type { ClockState } from '@chess/core/clock';
import type { PlayerInfo, RoomState } from '@chess/core/protocol';
import { cx } from '@/lib/classNames';
import { OnlineClock } from './OnlineClock';
import './RoomPlayers.scss';

export interface RoomPlayersProps {
	room: RoomState;
	/** Session clock (local time base) — preferred over room.clock. */
	clock?: ClockState;
	me: Color | null;
	/** Order: my colour at the bottom like the board. */
	orientation: Color;
}

function PlayerRow({ color, player, clock, me, toMove }: { color: Color; player?: PlayerInfo; clock?: ClockState; me: boolean; toMove: boolean }): JSX.Element {
	return (
		<li class={cx('room-players__row', toMove && 'room-players__row--to-move')}>
			<span class={cx('room-players__swatch', `room-players__swatch--${color}`)} aria-hidden="true" />
			<span class="room-players__who">
				<span class="room-players__name">{player ? player.displayName : 'Waiting for opponent…'}</span>
				<span class="room-players__sub">
					{player && (
						<span class={cx('room-players__presence', player.connected ? 'room-players__presence--on' : 'room-players__presence--off')}>
							{player.connected ? 'online' : 'disconnected'}
						</span>
					)}
					{me && <span class="room-players__you">you</span>}
				</span>
			</span>
			{clock && <OnlineClock clock={clock} color={color} />}
		</li>
	);
}

export function RoomPlayers({ room, clock, me, orientation }: RoomPlayersProps): JSX.Element {
	const turn = turnFromFen(room.fen);
	const order: Color[] = orientation === 'white' ? ['black', 'white'] : ['white', 'black'];
	const c = clock ?? room.clock;
	return (
		<div class="room-players">
			<ul class="room-players__list">
				{order.map((color) => (
					<PlayerRow key={color} color={color} player={room.players[color]} clock={c} me={me === color} toMove={!room.result && turn === color} />
				))}
			</ul>
			{room.spectators.length > 0 && (
				<p class="room-players__spectators">
					{room.spectators.length} watching · {room.spectators.map((s) => s.displayName).join(', ')}
				</p>
			)}
		</div>
	);
}

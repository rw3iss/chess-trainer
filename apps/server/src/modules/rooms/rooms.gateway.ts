import { OnModuleInit } from '@nestjs/common';
import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import {
	RoomEvents,
	type ChatMessage,
	type ChatPayload,
	type GameMovedPayload,
	type GameMovePayload,
	type GameResult,
	type RoomActionPayload,
	type RoomCreatePayload,
	type RoomJoinPayload,
	type RoomJoinResult,
	type RoomState,
	type WsAck,
} from '@chess/core';
import { ack, emitEnvelope, handshakeToken, socketUser, unwrap, WsError } from '../../common/ws/ws.util';
import { AuthService } from '../auth/auth.service';
import { RoomsService } from './rooms.service';

const channel = (roomId: string): string => `room:${roomId}`;

/**
 * Namespace `/play` — online rooms. Auth: access or guest JWT in
 * `handshake.auth.token`. Every command is a `WsEnvelope` acked with
 * `WsAck`; broadcasts are enveloped too. Logic lives in RoomsService.
 */
@WebSocketGateway({ namespace: '/play', cors: { origin: true, credentials: true } })
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
	@WebSocketServer() private readonly nsp!: Namespace;

	constructor(
		private readonly auth: AuthService,
		private readonly rooms: RoomsService,
	) {}

	onModuleInit(): void {
		const to = (roomId: string) => this.nsp.to(channel(roomId));
		this.rooms.bind({
			state: (room: RoomState) => emitEnvelope(to(room.id), RoomEvents.state, room),
			moved: (roomId: string, p: GameMovedPayload) => emitEnvelope(to(roomId), RoomEvents.moved, p),
			ended: (roomId: string, result: GameResult, room: RoomState) =>
				emitEnvelope(to(roomId), RoomEvents.ended, { roomId, result, room }),
			chat: (roomId: string, msg: ChatMessage) => emitEnvelope(to(roomId), RoomEvents.chat, msg),
			presence: (room: RoomState) =>
				emitEnvelope(to(room.id), RoomEvents.presence, { roomId: room.id, players: room.players, spectators: room.spectators }),
		});
	}

	async handleConnection(client: Socket): Promise<void> {
		client.data.rooms = new Set<string>();
		try {
			client.data.user = await this.auth.authenticate(handshakeToken(client));
		} catch (err) {
			client.emit('error', { code: 'UNAUTHORIZED', message: (err as Error).message });
			client.disconnect(true);
		}
	}

	handleDisconnect(client: Socket): void {
		const user = client.data.user;
		if (!user) return;
		for (const roomId of (client.data.rooms as Set<string> | undefined) ?? []) this.rooms.leave(user, roomId);
	}

	@SubscribeMessage(RoomEvents.create)
	create(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<RoomJoinResult>> {
		return ack(() => {
			const res = this.rooms.create(socketUser(client), unwrap<RoomCreatePayload>(msg).payload);
			this.track(client, res.room.id);
			return res;
		});
	}

	@SubscribeMessage(RoomEvents.join)
	join(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<RoomJoinResult>> {
		return ack(async () => {
			const { roomId } = unwrap<RoomJoinPayload>(msg).payload;
			const user = socketUser(client);
			if ((client.data.rooms as Set<string>).has(roomId)) {
				const room = await this.rooms.resync(roomId);
				const seat = room.players.white?.userId === user.id ? 'white' : room.players.black?.userId === user.id ? 'black' : 'spectator';
				return { room, seat };
			}
			// Join the channel first so the presence broadcast reaches this socket too.
			this.track(client, roomId);
			try {
				return await this.rooms.join(user, roomId);
			} catch (err) {
				this.untrack(client, roomId);
				throw err;
			}
		});
	}

	@SubscribeMessage(RoomEvents.leave)
	leave(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<null>> {
		return ack(() => {
			const { roomId } = unwrap<RoomJoinPayload>(msg).payload;
			if ((client.data.rooms as Set<string>).has(roomId)) {
				this.untrack(client, roomId);
				this.rooms.leave(socketUser(client), roomId);
			}
			return null;
		});
	}

	/** Full state, e.g. after a reconnect or a missed event. */
	@SubscribeMessage(RoomEvents.resync)
	resync(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<RoomState>> {
		return ack(() => {
			const { roomId } = unwrap<RoomJoinPayload>(msg).payload;
			this.requireJoined(client, roomId);
			return this.rooms.resync(roomId);
		});
	}

	@SubscribeMessage(RoomEvents.move)
	move(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<GameMovedPayload>> {
		return ack(() => {
			const { id, payload } = unwrap<GameMovePayload>(msg);
			this.requireJoined(client, payload.roomId);
			return this.rooms.move(socketUser(client), payload.roomId, payload.uci, id);
		});
	}

	@SubscribeMessage(RoomEvents.resign)
	resign(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<GameResult>> {
		return ack(() => {
			const { roomId } = unwrap<RoomJoinPayload>(msg).payload;
			this.requireJoined(client, roomId);
			return this.rooms.resign(socketUser(client), roomId);
		});
	}

	@SubscribeMessage(RoomEvents.drawOffer)
	drawOffer(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<RoomState>> {
		return ack(() => {
			const { roomId } = unwrap<RoomJoinPayload>(msg).payload;
			this.requireJoined(client, roomId);
			return this.rooms.offerDraw(socketUser(client), roomId);
		});
	}

	@SubscribeMessage(RoomEvents.drawAnswer)
	drawAnswer(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<RoomState>> {
		return ack(() => {
			const { roomId, accept } = unwrap<{ roomId: string; accept: boolean }>(msg).payload;
			this.requireJoined(client, roomId);
			return this.rooms.answerDraw(socketUser(client), roomId, accept === true);
		});
	}

	@SubscribeMessage(RoomEvents.chat)
	chat(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<ChatMessage>> {
		return ack(() => {
			const { roomId, text } = unwrap<ChatPayload>(msg).payload;
			this.requireJoined(client, roomId);
			return this.rooms.chat(socketUser(client), roomId, text);
		});
	}

	/** Generic extension point: relays `{ type, payload }` to everyone else in the room. */
	@SubscribeMessage(RoomEvents.action)
	action(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<null>> {
		return ack(() => {
			const { payload } = unwrap<RoomActionPayload>(msg);
			this.requireJoined(client, payload.roomId);
			if (typeof payload.type !== 'string' || !payload.type) throw new WsError('BAD_REQUEST', 'action type required');
			const user = socketUser(client);
			this.rooms.assertMember(user, payload.roomId);
			emitEnvelope(client.to(channel(payload.roomId)), RoomEvents.action, { ...payload, from: user.id });
			return null;
		});
	}

	private track(client: Socket, roomId: string): void {
		(client.data.rooms as Set<string>).add(roomId);
		void client.join(channel(roomId));
	}

	private untrack(client: Socket, roomId: string): void {
		(client.data.rooms as Set<string>).delete(roomId);
		void client.leave(channel(roomId));
	}

	private requireJoined(client: Socket, roomId: string): void {
		if (!(client.data.rooms as Set<string> | undefined)?.has(roomId)) throw new WsError('NOT_IN_ROOM', 'join the room first');
	}
}

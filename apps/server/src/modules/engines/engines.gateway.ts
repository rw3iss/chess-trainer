import { Logger } from '@nestjs/common';
import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import {
	EngineEvents,
	type EngineGoPayload,
	type EnginePositionPayload,
	type EngineStartPayload,
	type EngineStartResult,
	type WsAck,
} from '@chess/core';
import { ack, emitEnvelope, handshakeToken, socketUser, unwrap, WsError } from '../../common/ws/ws.util';
import { AuthService } from '../auth/auth.service';
import { EngineSessionsService, EngineSink } from './engine-sessions.service';
import { EnginesService } from './engines.service';

/**
 * Namespace `/engine` — remote UCI engines. Thin: authenticates the
 * handshake, unwraps envelopes, and delegates to EngineSessionsService.
 * Every command is acked with `WsAck`; results stream as enveloped
 * `engine:info` / `engine:bestmove` / `engine:error` / `engine:close` events.
 */
@WebSocketGateway({ namespace: '/engine', cors: { origin: true, credentials: true } })
export class EnginesGateway implements OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(EnginesGateway.name);

	constructor(
		private readonly auth: AuthService,
		private readonly engines: EnginesService,
		private readonly sessions: EngineSessionsService,
	) {}

	async handleConnection(client: Socket): Promise<void> {
		try {
			const user = await this.auth.authenticate(handshakeToken(client));
			if (user.role === 'guest' && !this.engines.cfg.allowGuests) throw new WsError('FORBIDDEN', 'guests cannot use server engines');
			client.data.user = user;
		} catch (err) {
			emitEnvelope(client, EngineEvents.error, { engineSessionId: '', message: (err as Error).message });
			client.disconnect(true);
		}
	}

	handleDisconnect(client: Socket): void {
		this.sessions.closeOwner(client.id);
	}

	@SubscribeMessage(EngineEvents.start)
	start(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<EngineStartResult>> {
		return ack(() => {
			socketUser(client); // handshake auth must have completed
			const { payload } = unwrap<EngineStartPayload>(msg);
			return this.sessions.start(client.id, String(payload.engineId), this.sink(client));
		});
	}

	@SubscribeMessage(EngineEvents.position)
	position(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<null>> {
		return ack(() => {
			this.sessions.setPosition(client.id, unwrap<EnginePositionPayload>(msg).payload);
			return null;
		});
	}

	@SubscribeMessage(EngineEvents.go)
	go(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<null>> {
		return ack(() => {
			this.sessions.go(client.id, unwrap<EngineGoPayload>(msg).payload);
			return null;
		});
	}

	@SubscribeMessage(EngineEvents.stop)
	stop(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<null>> {
		return ack(() => {
			this.sessions.stop(client.id, unwrap<{ engineSessionId: string }>(msg).payload.engineSessionId);
			return null;
		});
	}

	@SubscribeMessage(EngineEvents.close)
	close(@ConnectedSocket() client: Socket, @MessageBody() msg: unknown): Promise<WsAck<null>> {
		return ack(() => {
			this.sessions.close(client.id, unwrap<{ engineSessionId: string }>(msg).payload.engineSessionId);
			return null;
		});
	}

	private sink(client: Socket): EngineSink {
		return {
			info: (p) => emitEnvelope(client, EngineEvents.info, p),
			bestmove: (p) => emitEnvelope(client, EngineEvents.bestmove, p),
			error: (engineSessionId, message) => {
				this.logger.warn(`engine session ${engineSessionId}: ${message}`);
				emitEnvelope(client, EngineEvents.error, { engineSessionId, message });
			},
			closed: (engineSessionId, reason) => emitEnvelope(client, EngineEvents.close, { engineSessionId, reason }),
		};
	}
}

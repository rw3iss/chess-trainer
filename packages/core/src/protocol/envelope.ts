import { newId } from '../chess/id.js';
import { PROTOCOL_VERSION, type WsEnvelope } from './types.js';

/** Wrap a payload in a versioned WS envelope. `id` defaults to a fresh random id. */
export function envelope<T>(type: string, payload: T, id: string = newId()): WsEnvelope<T> {
	return { v: PROTOCOL_VERSION, type, id, payload };
}

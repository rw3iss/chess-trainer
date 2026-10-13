import { describe, expect, it } from 'vitest';
import { envelope } from './envelope.js';
import { EngineEvents, PROTOCOL_VERSION, RoomEvents } from './types.js';

describe('protocol', () => {
	it('envelope wraps payload with version and id', () => {
		const e = envelope(RoomEvents.move, { roomId: 'r', uci: 'e2e4' }, 'id1');
		expect(e).toEqual({ v: PROTOCOL_VERSION, type: 'game:move', id: 'id1', payload: { roomId: 'r', uci: 'e2e4' } });
		const a = envelope(EngineEvents.go, {});
		const b = envelope(EngineEvents.go, {});
		expect(a.id).toMatch(/^[\w-]{10}$/);
		expect(a.id).not.toBe(b.id);
	});
});

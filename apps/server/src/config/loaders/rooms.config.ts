import { registerAs } from '@nestjs/config';

export default registerAs('rooms', () => ({
	// Seconds a room is kept in the Redis mirror after its last change.
	ttl: parseInt(process.env.ROOM_TTL ?? String(24 * 3600), 10),
}));

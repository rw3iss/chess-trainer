import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
	// Empty / unset host → Redis disabled, in-memory cache is used instead.
	enabled: Boolean(process.env.REDIS_HOST),
	host: process.env.REDIS_HOST || undefined,
	port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
	password: process.env.REDIS_PASSWORD || undefined,
	db: parseInt(process.env.REDIS_DB ?? '0', 10),
}));

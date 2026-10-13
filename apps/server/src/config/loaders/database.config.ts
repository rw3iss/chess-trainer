import { registerAs } from '@nestjs/config';

export type DbType = 'sqlite' | 'postgres';

export default registerAs('database', () => ({
	type: (process.env.DB_TYPE ?? 'sqlite') as DbType,
	// SQLite file (relative to the server's cwd) or ':memory:'.
	path: process.env.DB_PATH || 'data/chess.sqlite',
	host: process.env.DB_HOST,
	port: parseInt(process.env.DB_PORT ?? '5432', 10),
	username: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	// Never true in staging/prod — use migrations. Honored only when NODE_ENV=development.
	synchronize: process.env.NODE_ENV === 'development' && process.env.DB_SYNCHRONIZE === 'true',
}));

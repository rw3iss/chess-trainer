import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { buildDbOptions } from './db-options';

// TypeORM CLI reads config from an exported DataSource. Used only by the
// migration commands (`pnpm migration:run` etc.); the app at runtime uses
// the async TypeOrmModule.forRootAsync factory in database.module.ts.

// Load .env so CLI invocations don't depend on @nestjs/config.
dotenv.config({ path: resolve(__dirname, '../../.env') });

export default new DataSource({
	...buildDbOptions({
		type: process.env.DB_TYPE === 'postgres' ? 'postgres' : 'sqlite',
		path: process.env.DB_PATH || 'data/chess.sqlite',
		host: process.env.DB_HOST,
		port: parseInt(process.env.DB_PORT ?? '5432', 10),
		username: process.env.DB_USER,
		password: process.env.DB_PASSWORD,
		database: process.env.DB_NAME,
	}),
	// Glob both .ts (dev) and .js (after build) so the same config works pre- and post-compile.
	entities: [resolve(__dirname, '../**/*.entity.{ts,js}')],
	migrationsRun: false,
});

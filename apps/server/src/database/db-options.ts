import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import type { DataSourceOptions } from 'typeorm';
import { MIGRATIONS } from './migrations';

/** Engine-independent DB settings (from the `database` config namespace or raw env for the CLI). */
export interface DbSettings {
	type: 'sqlite' | 'postgres';
	path?: string;
	host?: string;
	port?: number;
	username?: string;
	password?: string;
	database?: string;
	synchronize?: boolean;
}

/**
 * Builds TypeORM options for either engine. Everything above this function is
 * engine-agnostic: entities use portable column types (varchar/text/integer/
 * bigint/boolean, JSON stored as `simple-json` text) and the migrations use
 * TypeORM's `Table` API, so the same schema works on SQLite and Postgres.
 */
export function buildDbOptions(s: DbSettings): DataSourceOptions {
	const common = {
		synchronize: s.synchronize ?? false,
		migrations: MIGRATIONS,
		migrationsRun: true,
		migrationsTableName: 'migrations',
	};
	if (s.type === 'postgres') {
		return {
			...common,
			type: 'postgres',
			host: s.host,
			port: s.port ?? 5432,
			username: s.username,
			password: s.password,
			database: s.database,
		};
	}
	const path = s.path ?? 'data/chess.sqlite';
	if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
	return { ...common, type: 'better-sqlite3', database: path };
}

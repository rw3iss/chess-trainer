import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDbOptions, DbSettings } from './db-options';

/**
 * Wires TypeORM to SQLite (default, file under apps/server/data/) or Postgres
 * (`DB_TYPE=postgres`). See `db-options.ts` for the portability rules.
 *
 * Entities are auto-loaded via `autoLoadEntities: true` — each feature module
 * registers its entity with `TypeOrmModule.forFeature([Entity])`.
 * Migrations (src/database/migrations) run automatically at boot for both engines.
 */
@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				...buildDbOptions(config.get<DbSettings>('database')!),
				autoLoadEntities: true,
				logging: config.get<string>('app.env') === 'development' ? ['error', 'warn'] : ['error'],
			}),
		}),
	],
})
export class DatabaseModule {}

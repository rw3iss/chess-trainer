import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { envValidationSchema } from './env.validation';
import appConfig from './loaders/app.config';
import databaseConfig from './loaders/database.config';
import redisConfig from './loaders/redis.config';
import authConfig from './loaders/auth.config';
import openingsConfig from './loaders/openings.config';
import enginesConfig from './loaders/engines.config';
import roomsConfig from './loaders/rooms.config';

/**
 * Global config module.
 *
 * - Loads `.env` (apps/server) then the repo-root `.env` (where LICHESS_TOKEN lives).
 *   Earlier files win; real environment variables beat both.
 * - Validates every known env var via the Joi schema; failing fast at boot is preferable
 *   to `undefined`-related runtime errors hours later.
 * - Exposes namespaced config via `configService.get('app.port')` etc.
 *
 * Never read `process.env.FOO` directly in application code — go through ConfigService.
 */
@Global()
@Module({
	imports: [
		NestConfigModule.forRoot({
			isGlobal: true,
			cache: true,
			envFilePath: process.env.NODE_ENV === 'test' ? [] : ['.env', '../../.env'],
			load: [appConfig, databaseConfig, redisConfig, authConfig, openingsConfig, enginesConfig, roomsConfig],
			validationSchema: envValidationSchema,
			validationOptions: {
				allowUnknown: true,
				abortEarly: false,
			},
		}),
	],
})
export class ConfigModule {}

import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService, MemoryCacheService, RedisCacheService } from './cache.service';

/**
 * Global cache. Inject `CacheService` anywhere. Backend is chosen at boot:
 * REDIS_HOST set → Redis, otherwise an in-memory Map (single process only).
 */
@Global()
@Module({
	providers: [
		{
			provide: CacheService,
			inject: [ConfigService],
			useFactory: (config: ConfigService): CacheService => {
				const logger = new Logger('Cache');
				if (!config.get<boolean>('redis.enabled')) {
					logger.log('REDIS_HOST not set — using in-memory cache');
					return new MemoryCacheService();
				}
				const client = new Redis({
					host: config.get<string>('redis.host'),
					port: config.get<number>('redis.port'),
					password: config.get<string>('redis.password'),
					db: config.get<number>('redis.db'),
					maxRetriesPerRequest: 3,
				});
				logger.log('using Redis cache');
				return new RedisCacheService(client);
			},
		},
	],
	exports: [CacheService],
})
export class CacheModule {}

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { PROTOCOL_VERSION, type HealthDto } from '@chess/core';
import { CacheService } from '../cache/cache.service';
import { Public } from '../common/decorators/public.decorator';
import { EnginesService } from '../modules/engines/engines.service';
import { ExplorerService } from '../modules/openings/explorer.service';
import { UsersService } from '../modules/users/users.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg: { name: string; version: string } = require('../../package.json');

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
	constructor(
		@InjectDataSource() private readonly ds: DataSource,
		private readonly cache: CacheService,
		private readonly engines: EnginesService,
		private readonly explorer: ExplorerService,
		private readonly users: UsersService,
	) {}

	/**
	 * Liveness + feature flags. The web client calls this to detect the server
	 * and decide which server features to enable. Always 200 while the process is up.
	 */
	@Get()
	async live(): Promise<HealthDto & { uptime: number }> {
		return {
			status: 'ok',
			name: pkg.name,
			version: pkg.version,
			protocol: PROTOCOL_VERSION,
			features: {
				auth: (await this.users.count().catch(() => 0)) > 0,
				explorer: this.explorer.enabled,
				engines: this.engines.anyAvailable,
				rooms: true,
				sync: true,
			},
			uptime: process.uptime(),
		};
	}

	/**
	 * Readiness — verifies DB + cache are reachable.
	 * Individual statuses are in the body so ops tools can see what's degraded.
	 */
	@Get('ready')
	async ready(): Promise<{
		status: 'ok' | 'degraded';
		dependencies: { db: 'ok' | 'down'; cache: 'ok' | 'down'; cacheKind: 'redis' | 'memory' };
	}> {
		const db = await this.pingDb();
		const cache = (await this.cache.ping()) ? 'ok' : 'down';
		return {
			status: db === 'ok' && cache === 'ok' ? 'ok' : 'degraded',
			dependencies: { db, cache, cacheKind: this.cache.kind },
		};
	}

	private async pingDb(): Promise<'ok' | 'down'> {
		try {
			await this.ds.query('SELECT 1');
			return 'ok';
		} catch {
			return 'down';
		}
	}
}

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RemoteEngineDto } from '@chess/core';
import { EnginePool } from './engine-pool';
import { EngineSpec, EnginesConfig, resolveEngineSpecs } from './engine-specs';
import { UciProcess } from './uci-process';

/**
 * Remote engine catalog + availability. On boot every configured binary is
 * checked (exists + executable) and probed with a UCI handshake; failures
 * are reported per engine via `GET /engines` instead of failing the boot.
 */
@Injectable()
export class EnginesService implements OnApplicationBootstrap, OnModuleDestroy {
	private readonly logger = new Logger(EnginesService.name);
	readonly cfg: EnginesConfig;
	readonly pool: EnginePool;
	private specs: EngineSpec[];

	constructor(config: ConfigService) {
		this.cfg = config.get<EnginesConfig>('engines')!;
		this.specs = resolveEngineSpecs(this.cfg);
		this.pool = new EnginePool(this.cfg.maxProcesses, this.cfg.idleTimeoutMs);
	}

	async onApplicationBootstrap(): Promise<void> {
		await this.detect();
	}

	onModuleDestroy(): void {
		this.pool.shutdown();
	}

	/** Re-resolves paths and probes each available binary with `uci` / `isready`. */
	async detect(): Promise<void> {
		this.specs = resolveEngineSpecs(this.cfg);
		await Promise.all(
			this.specs.filter((s) => s.available).map(async (s) => {
				const proc = new UciProcess({ path: s.path!, args: s.args }, 5000);
				try {
					await proc.start();
					this.logger.log(`${s.meta.id}: ${proc.name || 'ok'} (${s.path})`);
				} catch (err) {
					s.available = false;
					s.reason = `UCI handshake failed: ${(err as Error).message}`;
				} finally {
					proc.quit();
				}
			}),
		);
		for (const s of this.specs) if (!s.available) this.logger.log(`${s.meta.id}: unavailable — ${s.reason}`);
	}

	/** Catalog for GET /engines. */
	list(): RemoteEngineDto[] {
		return this.specs.map((s) => (s.available ? { ...s.meta, available: true } : { ...s.meta, available: false, reason: s.reason }));
	}

	get anyAvailable(): boolean {
		return this.specs.some((s) => s.available);
	}

	spec(engineId: string): EngineSpec | undefined {
		return this.specs.find((s) => s.meta.id === engineId);
	}
}

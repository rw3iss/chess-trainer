import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

/**
 * Bootstrap the NestJS app: create, wire globals (see bootstrap.ts), listen.
 * Shutdown hooks are enabled so engine processes are killed on SIGTERM/SIGINT.
 */
async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule, { bufferLogs: true });
	app.enableShutdownHooks();
	configureApp(app);

	const config = app.get(ConfigService);
	const apiPrefix = config.get<string>('app.apiPrefix');
	const port = config.get<number>('app.port') ?? 3000;
	await app.listen(port);
	new Logger('Bootstrap').log(`server listening on http://localhost:${port}${apiPrefix ? '/' + apiPrefix : ''}`);
	if (config.get<boolean>('auth.jwtSecretIsEphemeral')) {
		new Logger('Bootstrap').warn('JWT_SECRET not set — using a random secret; tokens will not survive a restart');
	}
}

bootstrap().catch((err) => {
	// Last-resort handler — if we can't boot, we can't log via Nest.
	// eslint-disable-next-line no-console
	console.error('[bootstrap] fatal error:', err);
	process.exit(1);
});

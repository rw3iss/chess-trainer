import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/**
 * Global app wiring shared by `main.ts` and the e2e tests: API prefix, CORS,
 * validation, error/response envelopes, Swagger. Call before `listen` / `init`.
 */
export function configureApp(app: INestApplication, opts: { quiet?: boolean } = {}): void {
	const config = app.get(ConfigService);
	const logger = new Logger('Bootstrap');

	// ── API prefix (e.g. /api/v1) ────────────────────────────────────
	const apiPrefix = config.get<string>('app.apiPrefix');
	if (apiPrefix) app.setGlobalPrefix(apiPrefix);

	// ── CORS ─────────────────────────────────────────────────────────
	// Default: allow all origins. Lock down via CORS_ORIGINS env var
	// (comma-separated). When origins are restricted, `credentials: true`
	// is enabled so cookies/auth headers work cross-origin.
	const origins = config.get<string>('app.corsOrigins') ?? '*';
	if (origins === '*' || origins === '') {
		app.enableCors({ origin: '*' });
	} else {
		const allowList = origins.split(',').map((s) => s.trim()).filter(Boolean);
		app.enableCors({ origin: allowList, credentials: true });
	}

	// ── Global pipes / filters / interceptors ────────────────────────
	// ValidationPipe: strips unknown fields, transforms primitives, rejects extras.
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);
	app.useGlobalFilters(new AllExceptionsFilter());
	app.useGlobalInterceptors(...(opts.quiet ? [] : [new LoggingInterceptor()]), new ResponseInterceptor());

	// ── Swagger (/docs) ──────────────────────────────────────────────
	// On outside production; in production only with SWAGGER_ENABLED=true.
	if (config.get<boolean>('app.swagger')) {
		const doc = SwaggerModule.createDocument(
			app,
			new DocumentBuilder()
				.setTitle('Chess server')
				.setDescription(
					'Optional backend for the chess openings PWA. REST responses are wrapped as { data, timestamp }; ' +
						'errors as { error: { code, message, … } }. WebSocket namespaces /engine and /play are documented in DESIGN.md.',
				)
				.setVersion('1')
				.addBearerAuth()
				.build(),
		);
		SwaggerModule.setup('docs', app, doc);
		if (!opts.quiet) logger.log('Swagger UI at /docs');
	}
}

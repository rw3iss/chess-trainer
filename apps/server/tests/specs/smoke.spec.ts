import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

/**
 * Smoke — boots a minimal Nest app with the global interceptor + filter
 * wired in, verifies both the wrapped success shape and error normalization
 * work. No DB / Redis required — that's the point of a smoke test.
 */

@Controller()
class SmokeController {
	@Get('ok')
	ok(): { hello: string } {
		return { hello: 'world' };
	}

	@Get('boom')
	boom(): never {
		throw new Error('boom');
	}
}

describe('smoke', () => {
	let app: INestApplication;

	beforeAll(async () => {
		const mod: TestingModule = await Test.createTestingModule({
			controllers: [SmokeController],
		}).compile();

		app = mod.createNestApplication();
		app.useGlobalInterceptors(new ResponseInterceptor());
		app.useGlobalFilters(new AllExceptionsFilter());
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	it('wraps success responses as { data, timestamp }', async () => {
		const res = await request(app.getHttpServer()).get('/ok');
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ data: { hello: 'world' } });
		expect(typeof res.body.timestamp).toBe('string');
	});

	it('normalizes uncaught errors into { error: { code, message, ... } }', async () => {
		const res = await request(app.getHttpServer()).get('/boom');
		expect(res.status).toBe(500);
		expect(res.body).toMatchObject({
			error: { code: 'INTERNAL_ERROR', message: 'boom' },
		});
		expect(res.body.error).toHaveProperty('timestamp');
		expect(res.body.error).toHaveProperty('path', '/boom');
	});
});

describe('smoke: full app (sqlite :memory: + in-memory cache)', () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { bootApp } = require('../helpers/app') as typeof import('../helpers/app');
	let t: Awaited<ReturnType<typeof bootApp>>;

	beforeAll(async () => {
		t = await bootApp({ DATA_DIR: require('path').resolve(__dirname, '../fixtures/data') });
	});

	afterAll(async () => {
		await t.close();
	});

	it('GET /health returns HealthDto with feature flags', async () => {
		const res = await request(t.app.getHttpServer()).get('/health');
		expect(res.status).toBe(200);
		expect(res.body.data).toMatchObject({
			status: 'ok',
			name: '@chess/server',
			protocol: 1,
			features: { auth: true, explorer: false, engines: false, rooms: true, sync: true },
		});
	});

	it('GET /health/ready reports db + memory cache', async () => {
		const res = await request(t.app.getHttpServer()).get('/health/ready');
		expect(res.body.data).toEqual({ status: 'ok', dependencies: { db: 'ok', cache: 'ok', cacheKind: 'memory' } });
	});

	it('serves the openings manifest and dataset files with ETag', async () => {
		const m = await request(t.app.getHttpServer()).get('/openings/manifest');
		expect(m.status).toBe(200);
		expect(m.body.data.version).toBe(1);
		const f = await request(t.app.getHttpServer()).get('/openings/data/openings.v1.0123abcd.json');
		expect(f.status).toBe(200);
		expect(f.headers.etag).toBeDefined();
		expect(f.headers['cache-control']).toContain('immutable');
		const again = await request(t.app.getHttpServer())
			.get('/openings/data/openings.v1.0123abcd.json')
			.set('If-None-Match', f.headers.etag);
		expect(again.status).toBe(304);
		expect((await request(t.app.getHttpServer()).get('/openings/data/..%2Fsecret.json')).status).toBe(400);
		expect((await request(t.app.getHttpServer()).get('/openings/data/missing.json')).status).toBe(404);
	});

	it('serves Swagger UI at /docs outside production', async () => {
		const res = await request(t.app.getHttpServer()).get('/docs/');
		expect(res.status).toBe(200);
		expect(res.text).toContain('swagger');
	});

	it('requires auth by default', async () => {
		const res = await request(t.app.getHttpServer()).get('/games');
		expect(res.status).toBe(401);
		expect(res.body.error.code).toBe('UNAUTHORIZED');
	});
});

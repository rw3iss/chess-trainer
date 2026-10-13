import { describe, expect, it, vi } from 'vitest';
import { HttpApiAdapter } from './HttpApiAdapter';
import { MockApiAdapter } from './MockApiAdapter';
import { ApiRequestError } from './ApiClient';

describe('HttpApiAdapter', () => {
	it('unwraps { data } and sends the bearer token', async () => {
		const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'sf-native' }], timestamp: 't' }), { status: 200 })) as unknown as typeof fetch;
		const api = new HttpApiAdapter({ baseUrl: 'http://srv/', getToken: () => 'tok', fetchImpl });
		const engines = await api.engines();
		expect(engines[0]!.id).toBe('sf-native');
		const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://srv/engines');
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
	});

	it('maps { error } bodies to ApiRequestError', async () => {
		const fetchImpl = vi.fn(
			async () => new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Nope', timestamp: 't', path: '/auth/me' } }), { status: 401 }),
		) as unknown as typeof fetch;
		const api = new HttpApiAdapter({ baseUrl: 'http://srv', fetchImpl });
		await expect(api.me()).rejects.toMatchObject({ status: 401, code: 'unauthorized', message: 'Nope' });
		await expect(api.me()).rejects.toBeInstanceOf(ApiRequestError);
	});
});

describe('MockApiAdapter', () => {
	it('serves fixtures for every server-only call', async () => {
		const mock = new MockApiAdapter(0);
		expect((await mock.health()).status).toBe('ok');
		expect((await mock.engines()).length).toBeGreaterThan(0);
		const ex = await mock.explorer('fen-x', 'masters');
		expect(ex).toMatchObject({ fen: 'fen-x', source: 'masters' });
		expect((await mock.login({ username: 'me', password: 'x' })).user.username).toBe('me');
	});
});

import { describe, expect, it, vi } from 'vitest';
import { ServerConnector } from './ServerConnector';

const okFetch = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe('ServerConnector', () => {
	it('is unconfigured without a URL', async () => {
		const c = new ServerConnector({ listenNetwork: false });
		expect(await c.configure('')).toBe('unconfigured');
		expect(c.status.value).toBe('unconfigured');
	});

	it('goes online on a 200 /health and unwraps { data }', async () => {
		const fetchImpl = okFetch({ data: { status: 'ok', name: 'srv', version: '1', protocol: 1, features: {} }, timestamp: 'x' });
		const c = new ServerConnector({ fetchImpl, listenNetwork: false });
		expect(await c.configure('http://srv:3000/')).toBe('online');
		expect(c.url.value).toBe('http://srv:3000');
		expect(c.health.value?.name).toBe('srv');
		expect(fetchImpl).toHaveBeenCalledWith('http://srv:3000/health', expect.anything());
	});

	it('is offline on network errors and on timeout', async () => {
		const failing = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		const c = new ServerConnector({ fetchImpl: failing, listenNetwork: false });
		expect(await c.configure('http://x')).toBe('offline');

		const hanging = vi.fn(
			(_url: string, init?: RequestInit) =>
				new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))),
		) as unknown as typeof fetch;
		const t = new ServerConnector({ fetchImpl: hanging, timeoutMs: 20, listenNetwork: false });
		expect(await t.configure('http://slow')).toBe('offline');
	});

	it('probes periodically after start()', async () => {
		vi.useFakeTimers();
		const fetchImpl = okFetch({ status: 'ok' });
		const c = new ServerConnector({ fetchImpl, intervalMs: 1000, listenNetwork: false });
		await c.start('http://srv');
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(2000);
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		c.stop();
		vi.useRealTimers();
	});
});

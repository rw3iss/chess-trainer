// Single injection point for server-only data (build-skill mock-layer rule).
// `api` delegates per call: HttpApiAdapter while ServerConnector is 'online',
// MockApiAdapter otherwise — callers never pick an adapter themselves.
import { computed } from '@preact/signals';
import { serverConnector } from '@/services/server';
import type { ApiClient } from './ApiClient';
import { HttpApiAdapter } from './HttpApiAdapter';
import { MockApiAdapter } from './MockApiAdapter';

export type { ApiClient, RoomSummary } from './ApiClient';
export { ApiRequestError } from './ApiClient';

let tokenProvider: () => string | null = () => null;
const mock: ApiClient = new MockApiAdapter();
let http: HttpApiAdapter | null = null;
let httpUrl: string | null = null;

/** Auth layer registers how to read the current access token. */
export function setAuthTokenProvider(fn: () => string | null): void {
	tokenProvider = fn;
}

function httpFor(url: string): HttpApiAdapter {
	if (!http || httpUrl !== url) {
		http = new HttpApiAdapter({ baseUrl: url, getToken: () => tokenProvider() });
		httpUrl = url;
	}
	return http;
}

/** The adapter that should serve a request right now. */
export function currentApi(): ApiClient {
	const url = serverConnector.url.value;
	return serverConnector.status.value === 'online' && url ? httpFor(url) : mock;
}

export const apiKind = computed<ApiClient['kind']>(() => (serverConnector.status.value === 'online' ? 'http' : 'mock'));

export const api: ApiClient = {
	get kind() {
		return currentApi().kind;
	},
	health: () => currentApi().health(),
	login: (req) => currentApi().login(req),
	refresh: (t) => currentApi().refresh(t),
	guest: (req) => currentApi().guest(req),
	me: () => currentApi().me(),
	explorer: (fen, source) => currentApi().explorer(fen, source),
	engines: () => currentApi().engines(),
	sync: (req) => currentApi().sync(req),
	rooms: () => currentApi().rooms(),
};

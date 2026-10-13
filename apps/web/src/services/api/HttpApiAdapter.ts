// Real server adapter: fetch + unwrap the server's `{ data, timestamp }` envelope
// and map `{ error }` bodies to ApiRequestError.
import type {
	AuthTokens,
	ExplorerResult,
	ExplorerSource,
	GuestTokenRequest,
	HealthDto,
	LoginRequest,
	RemoteEngineDto,
	SyncRequest,
	SyncResponse,
	UserDto,
} from '@chess/core/protocol';
import { ApiRequestError, type ApiClient, type RoomSummary } from './ApiClient';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface HttpApiOptions {
	baseUrl: string;
	getToken?: () => string | null;
	/** Called once on a 401 when a token was sent; resolve a new token to retry with (null = give up). */
	onUnauthorized?: () => Promise<string | null>;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}

function unwrap<T>(body: unknown): T {
	if (body && typeof body === 'object' && 'data' in body) return (body as { data: T }).data;
	return body as T;
}

export class HttpApiAdapter implements ApiClient {
	readonly kind = 'http' as const;
	private base: string;

	constructor(private opts: HttpApiOptions) {
		this.base = opts.baseUrl.replace(/\/+$/, '');
	}

	private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		try {
			return await this.send<T>(method, path, body, this.opts.getToken?.() ?? null);
		} catch (e) {
			// Expired access token → refresh once and retry.
			if (!(e instanceof ApiRequestError) || e.status !== 401 || !this.opts.getToken?.() || !this.opts.onUnauthorized) throw e;
			const fresh = await this.opts.onUnauthorized();
			if (!fresh) throw e;
			return this.send<T>(method, path, body, fresh);
		}
	}

	private async send<T>(method: string, path: string, body: unknown, token: string | null): Promise<T> {
		const fetchImpl = this.opts.fetchImpl ?? fetch;
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
		const headers: Record<string, string> = { Accept: 'application/json' };
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (token) headers.Authorization = `Bearer ${token}`;
		try {
			const res = await fetchImpl(`${this.base}${path}`, {
				method,
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: ctrl.signal,
			});
			const text = await res.text();
			const json: unknown = text ? JSON.parse(text) : undefined;
			if (!res.ok) {
				const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
				throw new ApiRequestError(err?.message ?? res.statusText, res.status, err?.code, err?.details);
			}
			return unwrap<T>(json);
		} catch (e) {
			if (e instanceof ApiRequestError) throw e;
			throw new ApiRequestError(e instanceof Error ? e.message : String(e), 0, 'network');
		} finally {
			clearTimeout(timer);
		}
	}

	async health(): Promise<HealthDto> {
		const h = await this.request<Partial<HealthDto>>('GET', '/health');
		return {
			status: 'ok',
			name: h.name ?? 'chess-server',
			version: h.version ?? '0.0.0',
			protocol: 1,
			features: { auth: false, explorer: false, engines: false, rooms: false, sync: false, ...h.features },
		};
	}
	login(req: LoginRequest): Promise<AuthTokens> {
		return this.request('POST', '/auth/login', req);
	}
	refresh(refreshToken: string): Promise<AuthTokens> {
		return this.request('POST', '/auth/refresh', { refreshToken });
	}
	guest(req: GuestTokenRequest): Promise<AuthTokens> {
		return this.request('POST', '/auth/guest', req);
	}
	me(): Promise<UserDto> {
		return this.request('GET', '/auth/me');
	}
	explorer(fen: string, source: ExplorerSource = 'lichess'): Promise<ExplorerResult> {
		const q = new URLSearchParams({ fen, source });
		return this.request('GET', `/explorer?${q}`);
	}
	engines(): Promise<RemoteEngineDto[]> {
		return this.request('GET', '/engines');
	}
	sync(req: SyncRequest): Promise<SyncResponse> {
		return this.request('POST', '/sync', req);
	}
	rooms(): Promise<RoomSummary[]> {
		return this.request('GET', '/rooms');
	}
}

// ServerConnector — detects the optional NestJS server (PLAN §0: the app must
// work fully offline). Probes `${url}/health` with a 1.5 s timeout on boot,
// every 60 s, and on the window 'online' event. Features read `serverStatus`
// and degrade (mock API, local engines, static datasets) when not 'online'.
import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { HealthDto } from '@chess/core/protocol';

export type ServerStatus = 'online' | 'offline' | 'unconfigured';

/** Build-time default (`VITE_DEFAULT_SERVER_URL`, e.g. https://chess.ryanweiss.net/api in prod). */
export const DEFAULT_SERVER_URL: string =
	(import.meta.env?.VITE_DEFAULT_SERVER_URL as string | undefined) || 'http://localhost:3000';
export const PROBE_TIMEOUT_MS = 1500;
export const PROBE_INTERVAL_MS = 60_000;

export interface ServerConnectorOptions {
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
	intervalMs?: number;
	/** Attach window online/offline listeners (default true in browsers). */
	listenNetwork?: boolean;
}

export class ServerConnector {
	private readonly _status = signal<ServerStatus>('unconfigured');
	private readonly _url = signal<string | null>(null);
	private readonly _health = signal<HealthDto | null>(null);
	private readonly _checking = signal(false);
	private readonly _lastCheckedAt = signal<number | null>(null);
	private readonly _networkOnline = signal(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
	private timer: ReturnType<typeof setInterval> | null = null;
	private probeSeq = 0;
	private started = false;

	readonly status: ReadonlySignal<ServerStatus> = this._status;
	readonly url: ReadonlySignal<string | null> = this._url;
	readonly health: ReadonlySignal<HealthDto | null> = this._health;
	readonly checking: ReadonlySignal<boolean> = this._checking;
	readonly lastCheckedAt: ReadonlySignal<number | null> = this._lastCheckedAt;
	/** Browser network state (navigator.onLine) — drives the offline indicator. */
	readonly networkOnline: ReadonlySignal<boolean> = this._networkOnline;
	readonly isOnline = computed(() => this._status.value === 'online');

	constructor(private opts: ServerConnectorOptions = {}) {}

	/** Set (or clear with null/'') the server URL and re-probe immediately. */
	configure(url: string | null): Promise<ServerStatus> {
		const clean = url?.trim().replace(/\/+$/, '') || null;
		this._url.value = clean;
		if (!clean) {
			this._status.value = 'unconfigured';
			this._health.value = null;
			return Promise.resolve('unconfigured');
		}
		return this.probe();
	}

	/** Start periodic probing + network listeners. Idempotent. */
	start(url: string | null = DEFAULT_SERVER_URL): Promise<ServerStatus> {
		if (!this.started) {
			this.started = true;
			this.timer = setInterval(() => void this.probe(), this.opts.intervalMs ?? PROBE_INTERVAL_MS);
			if ((this.opts.listenNetwork ?? true) && typeof window !== 'undefined') {
				window.addEventListener('online', this.onOnline);
				window.addEventListener('offline', this.onOffline);
			}
		}
		return this.configure(url);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.started = false;
		if (typeof window !== 'undefined') {
			window.removeEventListener('online', this.onOnline);
			window.removeEventListener('offline', this.onOffline);
		}
	}

	async probe(): Promise<ServerStatus> {
		const url = this._url.value;
		if (!url) {
			this._status.value = 'unconfigured';
			return 'unconfigured';
		}
		const seq = ++this.probeSeq;
		this._checking.value = true;
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? PROBE_TIMEOUT_MS);
		let next: ServerStatus = 'offline';
		let health: HealthDto | null = null;
		try {
			const res = await (this.opts.fetchImpl ?? fetch)(`${url}/health`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
			if (res.ok) {
				next = 'online';
				const body: unknown = await res.json().catch(() => null);
				const data = body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body;
				health = (data as HealthDto | null) ?? null;
			}
		} catch {
			next = 'offline';
		} finally {
			clearTimeout(timer);
		}
		// A newer probe (or configure) superseded this one.
		if (seq !== this.probeSeq || url !== this._url.value) return this._status.value;
		this._checking.value = false;
		this._lastCheckedAt.value = Date.now();
		this._health.value = health;
		this._status.value = next;
		return next;
	}

	private onOnline = () => {
		this._networkOnline.value = true;
		void this.probe();
	};

	private onOffline = () => {
		this._networkOnline.value = false;
		if (this._url.value) this._status.value = 'offline';
	};
}

/** App-wide connector instance. */
export const serverConnector = new ServerConnector();
export const serverStatus = serverConnector.status;

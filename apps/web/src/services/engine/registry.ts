import { ENGINE_CATALOG, type EngineAdapter, type EngineMeta, type RemoteEngineDto } from '@chess/core';
import { EngineAssetStore, type AssetFile } from './assetStore';
import { MAIA2_DEFAULT_MODEL_URL, MAIA2_MODEL_BYTES, MaiaAdapter, type MaiaAdapterOptions } from './adapters/MaiaAdapter';
import { RemoteEngineAdapter, type RemoteEngineOptions } from './adapters/RemoteEngineAdapter';
import { StockfishWorkerAdapter, type StockfishWorkerOptions } from './adapters/StockfishWorkerAdapter';
import type { AdapterFactory, EngineAvailability, EngineEntry, EngineListSource, ProgressCallback, UnavailableReason } from './types';
import { engineAssetUrl } from './util';

/** Shape of public/engines/manifest.json (written by scripts/copy-engines.mjs). */
export interface EngineManifest {
	engines: Record<string, { script: string; wasm: string; totalBytes: number; onDemand: boolean; files: { path: string; bytes: number }[] }>;
}

export interface RemoteConnection {
	serverUrl: string;
	token?: RemoteEngineOptions['token'];
	createSocket?: RemoteEngineOptions['createSocket'];
}

export interface EngineRegistryOptions {
	store?: EngineAssetStore;
	/** Defaults to fetching `engines/manifest.json`. */
	loadManifest?: () => Promise<EngineManifest | null>;
	/** Server engine list (ApiClient). Omit when offline / no server. */
	api?: EngineListSource | null;
	remote?: RemoteConnection | null;
	/** Overrides for adapter construction (tests, Node). */
	stockfish?: Partial<Omit<StockfishWorkerOptions, 'scriptUrl'>>;
	maia?: Partial<Omit<MaiaAdapterOptions, 'store'>>;
	/** Custom factories by engine id (take precedence). */
	factories?: Record<string, AdapterFactory>;
	/** Dispose adapters unused for this long (ms). 0 = never. Default 5 min. */
	idleDisposeMs?: number;
	isCrossOriginIsolated?: () => boolean;
}

/** Local-catalog overrides: the local Maia adapter runs Maia-2 (one ~89 MB model, Elo input). */
const LOCAL_META_OVERRIDES: Record<string, Partial<EngineMeta>> = {
	maia: { name: 'Maia-2 (human-like)', sizeMb: Math.round(MAIA2_MODEL_BYTES / 1048576), eloRange: [1100, 2000] },
};

const MESSAGES: Record<UnavailableReason, string> = {
	'needs-download': 'Needs download',
	'needs-server': 'Needs the server',
	'binary-missing': 'Engine files are not installed',
	'needs-isolation': 'Needs cross-origin isolation (COOP/COEP headers)',
	'model-missing': 'Model not downloaded',
	'server-unavailable': 'Not available on the server',
};

interface CachedAdapter {
	adapter: EngineAdapter;
	lastUsed: number;
}

/**
 * Engine catalog + availability + adapter lifecycle.
 *
 *   const reg = new EngineRegistry({ api, remote: { serverUrl, token } });
 *   const engines = await reg.list();           // EngineEntry[] (meta + availability)
 *   await reg.download('sf-full', p => …);      // on-demand engines
 *   const sf = await reg.getAdapter('sf-lite'); // lazily constructed + cached
 */
export class EngineRegistry {
	readonly store: EngineAssetStore;
	private manifest: EngineManifest | null | undefined;
	private remoteList: RemoteEngineDto[] = [];
	private readonly adapters = new Map<string, CachedAdapter>();
	private readonly listeners = new Set<() => void>();
	private idleTimer: ReturnType<typeof setInterval> | null = null;

	constructor(private opts: EngineRegistryOptions = {}) {
		this.store = opts.store ?? new EngineAssetStore();
	}

	/** Called when availability changes (download / remove / server list refresh). */
	subscribe(fn: () => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	/** Switch server (or go offline with null). Remote adapters are disposed. */
	setRemote(api: EngineListSource | null, remote: RemoteConnection | null): void {
		this.opts = { ...this.opts, api, remote };
		this.remoteList = [];
		for (const [id, c] of this.adapters) {
			if (c.adapter.meta.kind === 'remote') {
				c.adapter.dispose();
				this.adapters.delete(id);
			}
		}
		this.emit();
	}

	/** Re-fetches the server engine list (errors → treated as no server). */
	async refreshRemote(): Promise<void> {
		try {
			this.remoteList = this.opts.api && this.opts.remote ? await this.opts.api.listEngines() : [];
		} catch {
			this.remoteList = [];
		}
		this.emit();
	}

	/** Every known engine with availability. Local catalog first, then remote. */
	async list(opts: { refreshRemote?: boolean } = {}): Promise<EngineEntry[]> {
		if (opts.refreshRemote ?? true) await this.refreshRemote();
		await this.getManifest();
		const out: EngineEntry[] = [];
		for (const base of ENGINE_CATALOG) {
			if (base.kind !== 'local') continue;
			const meta = this.localMeta(base);
			out.push({ meta, availability: await this.localAvailability(meta) });
		}
		const seen = new Set<string>();
		for (const dto of this.remoteList) {
			seen.add(dto.id);
			const { available, reason, ...meta } = dto;
			const a: EngineAvailability = { available, downloadable: false, installed: available };
			if (!available) {
				a.reason = 'server-unavailable';
				a.message = reason ?? MESSAGES['server-unavailable'];
			}
			out.push({ meta, availability: a });
		}
		// Catalog remote engines the server did not report (or no server at all).
		for (const meta of ENGINE_CATALOG) {
			if (meta.kind !== 'remote' || seen.has(meta.id)) continue;
			const hasServer = !!this.opts.remote && this.remoteList.length > 0;
			const reason: UnavailableReason = hasServer ? 'server-unavailable' : 'needs-server';
			out.push({ meta, availability: { available: false, reason, message: MESSAGES[reason], downloadable: false, installed: false } });
		}
		return out;
	}

	async availability(id: string): Promise<EngineAvailability> {
		const entry = (await this.list({ refreshRemote: false })).find((e) => e.meta.id === id);
		return entry?.availability ?? { available: false, reason: 'binary-missing', message: 'Unknown engine', downloadable: false, installed: false };
	}

	/** Downloads an on-demand engine (sf-full, maia) into Cache Storage. */
	async download(id: string, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<void> {
		const files = await this.downloadFiles(id);
		if (!files) throw new Error(`${id} is not downloadable`);
		await this.store.download(files, onProgress, signal);
		this.disposeAdapter(id);
		this.emit();
	}

	async remove(id: string): Promise<void> {
		const files = await this.downloadFiles(id);
		if (!files) return;
		this.disposeAdapter(id);
		await this.store.remove(files.map((f) => f.url));
		this.emit();
	}

	/** Imports a user-picked Maia model file (when the default URL is unreachable). */
	async importMaiaModel(file: Blob): Promise<void> {
		await this.store.importBlob(this.maiaModelUrl(), file);
		this.disposeAdapter('maia');
		this.emit();
	}

	/** Lazily constructs (and caches) the adapter. Does not call init(). */
	async getAdapter(id: string): Promise<EngineAdapter> {
		const cached = this.adapters.get(id);
		if (cached) {
			cached.lastUsed = Date.now();
			return cached.adapter;
		}
		const adapter = await this.create(id);
		this.adapters.set(id, { adapter, lastUsed: Date.now() });
		this.startIdleTimer();
		return adapter;
	}

	/** Marks an adapter as in use (resets its idle timer). */
	touch(id: string): void {
		const c = this.adapters.get(id);
		if (c) c.lastUsed = Date.now();
	}

	disposeAdapter(id: string): void {
		const c = this.adapters.get(id);
		if (!c) return;
		c.adapter.dispose();
		this.adapters.delete(id);
	}

	/** Disposes adapters idle for longer than `idleDisposeMs` (and not busy). */
	disposeIdle(now = Date.now()): void {
		const limit = this.opts.idleDisposeMs ?? 5 * 60_000;
		if (!limit) return;
		for (const [id, c] of this.adapters) {
			if (c.adapter.status !== 'busy' && now - c.lastUsed > limit) this.disposeAdapter(id);
		}
	}

	dispose(): void {
		for (const id of this.adapters.keys()) this.disposeAdapter(id);
		if (this.idleTimer) clearInterval(this.idleTimer);
		this.idleTimer = null;
		this.listeners.clear();
	}

	// ── internals ────────────────────────────────────────────────────────

	private emit(): void {
		for (const fn of this.listeners) fn();
	}

	private startIdleTimer(): void {
		const limit = this.opts.idleDisposeMs ?? 5 * 60_000;
		if (!limit || this.idleTimer) return;
		this.idleTimer = setInterval(() => this.disposeIdle(), Math.min(60_000, limit));
	}

	private localMeta(base: EngineMeta): EngineMeta {
		const o = LOCAL_META_OVERRIDES[base.id];
		const meta = o ? { ...base, ...o } : { ...base };
		const m = this.manifest?.engines[base.id];
		if (m) meta.sizeMb = Math.round((m.totalBytes / 1048576) * 10) / 10;
		return meta;
	}

	private async getManifest(): Promise<EngineManifest | null> {
		if (this.manifest !== undefined) return this.manifest;
		const load =
			this.opts.loadManifest ??
			(async () => {
				const res = await fetch(engineAssetUrl('manifest.json'));
				return res.ok ? ((await res.json()) as EngineManifest) : null;
			});
		try {
			this.manifest = await load();
		} catch {
			this.manifest = null;
		}
		return this.manifest;
	}

	private maiaModelUrl(): string {
		return this.opts.maia?.modelUrl ?? MAIA2_DEFAULT_MODEL_URL;
	}

	private async downloadFiles(id: string): Promise<AssetFile[] | null> {
		if (id === 'maia') return [{ url: this.maiaModelUrl(), bytes: MAIA2_MODEL_BYTES }];
		const m = (await this.getManifest())?.engines[id];
		if (!m?.onDemand) return null;
		return m.files.map((f) => ({ url: engineAssetUrl(f.path), bytes: f.bytes }));
	}

	private async localAvailability(meta: EngineMeta): Promise<EngineAvailability> {
		const no = (reason: UnavailableReason, extra: Partial<EngineAvailability> = {}): EngineAvailability => ({
			available: false,
			reason,
			message: MESSAGES[reason],
			downloadable: false,
			installed: false,
			...extra,
		});
		if (this.opts.factories?.[meta.id]) return { available: true, downloadable: false, installed: true };
		if (meta.requiresIsolation && !(this.opts.isCrossOriginIsolated?.() ?? (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated))) {
			return no('needs-isolation');
		}
		if (meta.id === 'maia') {
			const installed = await this.store.has([this.maiaModelUrl()]);
			if (installed) return { available: true, downloadable: true, installed: true };
			return this.store.supported ? no('model-missing', { downloadable: true }) : no('binary-missing');
		}
		if (meta.family === 'fairy') {
			return { ...no('binary-missing'), message: 'Fairy-Stockfish WASM is not bundled (no npm build installed)' };
		}
		const m = (await this.getManifest())?.engines[meta.id];
		if (!m) return no('binary-missing');
		if (!m.onDemand) return { available: true, downloadable: false, installed: true };
		const installed = await this.store.has(m.files.map((f) => engineAssetUrl(f.path)));
		if (installed) return { available: true, downloadable: true, installed: true };
		return no('needs-download', { downloadable: this.store.supported });
	}

	private async create(id: string): Promise<EngineAdapter> {
		const custom = this.opts.factories?.[id];
		if (custom) return custom();
		const base = ENGINE_CATALOG.find((e) => e.id === id) ?? this.remoteList.find((e) => e.id === id);
		if (!base) throw new Error(`unknown engine: ${id}`);
		if (base.kind === 'remote') {
			const remote = this.opts.remote;
			if (!remote) throw new Error(`${id} needs the server`);
			const o: RemoteEngineOptions = { serverUrl: remote.serverUrl };
			if (remote.token !== undefined) o.token = remote.token;
			if (remote.createSocket) o.createSocket = remote.createSocket;
			return new RemoteEngineAdapter(base, o);
		}
		const meta = this.localMeta(base);
		if (id === 'maia') return new MaiaAdapter(meta, { store: this.store, ...this.opts.maia });
		if (meta.family === 'stockfish') {
			const m = (await this.getManifest())?.engines[id];
			if (!m) throw new Error(`${id}: engine files missing (run scripts/copy-engines.mjs)`);
			const opts: StockfishWorkerOptions = { scriptUrl: engineAssetUrl(m.script), ...this.opts.stockfish };
			if (m.onDemand && !opts.resolveWasmUrl) {
				const wasmUrl = engineAssetUrl(m.wasm);
				opts.resolveWasmUrl = async () => {
					const blob = await this.store.blobUrl(wasmUrl, 'application/wasm');
					if (!blob) throw new Error(`${id} is not downloaded`);
					return blob;
				};
			}
			return new StockfishWorkerAdapter(meta, opts);
		}
		throw new Error(`${id}: no local adapter (${meta.family})`);
	}
}

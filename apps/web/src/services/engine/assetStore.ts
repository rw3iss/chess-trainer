import type { ProgressCallback } from './types';

/** Cache Storage bucket for on-demand engine files (SW runtime route should use the same name). */
export const ENGINE_CACHE = 'chess-engines-v1';

export interface AssetFile {
	url: string;
	/** Expected size, used for progress when the response has no Content-Length. */
	bytes?: number;
}

/** The parts of the CacheStorage API we use (injectable for tests). */
export interface CacheStorageLike {
	open(name: string): Promise<Cache>;
}

/**
 * Downloads engine assets into Cache Storage with byte-level progress, and
 * hands them back as blob: URLs / ArrayBuffers. Keys are the asset URLs, so a
 * service-worker CacheFirst route on the same cache name serves them offline.
 */
export class EngineAssetStore {
	constructor(
		private readonly cacheName = ENGINE_CACHE,
		private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
		private readonly cachesApi: CacheStorageLike | undefined = typeof caches !== 'undefined' ? caches : undefined,
	) {}

	get supported(): boolean {
		return !!this.cachesApi;
	}

	async has(urls: string[]): Promise<boolean> {
		if (!this.cachesApi) return false;
		const cache = await this.cachesApi.open(this.cacheName);
		for (const url of urls) if (!(await cache.match(url))) return false;
		return true;
	}

	/** Downloads every file (skipping ones already cached) and reports combined progress. */
	async download(files: AssetFile[], onProgress?: ProgressCallback, signal?: AbortSignal): Promise<void> {
		if (!this.cachesApi) throw new Error('Cache Storage is not available in this browser');
		const cache = await this.cachesApi.open(this.cacheName);
		const todo: AssetFile[] = [];
		for (const f of files) if (!(await cache.match(f.url))) todo.push(f);
		const totals = todo.map((f) => f.bytes ?? 0);
		const loaded = todo.map(() => 0);
		const report = (): void => {
			const totalBytes = totals.reduce((a, b) => a + b, 0);
			const loadedBytes = loaded.reduce((a, b) => a + b, 0);
			onProgress?.({ loadedBytes, totalBytes, fraction: totalBytes ? Math.min(1, loadedBytes / totalBytes) : 0 });
		};
		report();
		for (const [i, f] of todo.entries()) {
			const init: RequestInit = { cache: 'no-store' };
			if (signal) init.signal = signal;
			const res = await this.fetchFn(f.url, init);
			if (!res.ok || !res.body) throw new Error(`download failed: ${f.url} (HTTP ${res.status})`);
			const len = Number(res.headers.get('content-length'));
			if (len > 0) totals[i] = len;
			const counter = new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, ctl) {
					loaded[i]! += chunk.byteLength;
					report();
					ctl.enqueue(chunk);
				},
			});
			// Stream straight into the cache: the 90+ MB files are never buffered in JS.
			// Body is already decoded, so only keep the content type (not encoding/length).
			const headers = { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' };
			await cache.put(f.url, new Response(res.body.pipeThrough(counter), { status: 200, headers }));
			loaded[i] = totals[i] || loaded[i]!;
			report();
		}
	}

	/** Stores a user-provided file under `url` (e.g. a Maia model picked from disk). */
	async importBlob(url: string, blob: Blob, contentType = 'application/octet-stream'): Promise<void> {
		if (!this.cachesApi) throw new Error('Cache Storage is not available in this browser');
		const cache = await this.cachesApi.open(this.cacheName);
		await cache.put(url, new Response(blob, { headers: { 'content-type': contentType, 'content-length': String(blob.size) } }));
	}

	async remove(urls: string[]): Promise<void> {
		if (!this.cachesApi) return;
		const cache = await this.cachesApi.open(this.cacheName);
		await Promise.all(urls.map((u) => cache.delete(u)));
	}

	async arrayBuffer(url: string): Promise<ArrayBuffer | undefined> {
		const res = await this.match(url);
		return res ? res.arrayBuffer() : undefined;
	}

	/** blob: URL of a cached file (caller should revoke it when done). */
	async blobUrl(url: string, type?: string): Promise<string | undefined> {
		const res = await this.match(url);
		if (!res) return undefined;
		const blob = await res.blob();
		return URL.createObjectURL(type && blob.type !== type ? new Blob([blob], { type }) : blob);
	}

	private async match(url: string): Promise<Response | undefined> {
		if (!this.cachesApi) return undefined;
		const cache = await this.cachesApi.open(this.cacheName);
		return cache.match(url);
	}
}

// Openings dataset loader (PLAN §2.3). Reads /data/manifest.json, then the hashed
// dataset files it names. Hashed files are immutable → cache-first in Cache
// Storage ('chess-openings-data'); the manifest is network-first with a cached
// fallback so the app keeps working offline. Stale hashed files are pruned.
//
//   const ds = await loadOpeningsDataset();          // { manifest, openings, openingsText, graph }
//   const notes = await loadNotesChunk(ds.manifest, 'B');
import type { GraphFile, NotesFile, OpeningsFile, OpeningsManifest } from '@chess/core/openings';

export const DATA_CACHE_NAME = 'chess-openings-data';
export const SUPPORTED_DATASET_VERSION = 1;

export interface DatasetSource {
	/** Base URL of the data folder (no trailing slash). Default '/data'. */
	baseUrl: string;
	fetch: (url: string, init?: RequestInit) => Promise<Response>;
	/** Cache Storage (null = no caching, e.g. tests / insecure contexts). */
	caches: CacheStorage | null;
}

export interface OpeningsDataset {
	manifest: OpeningsManifest;
	openings: OpeningsFile;
	/** Raw JSON text of the openings file (handed to the search worker as-is). */
	openingsText: string;
	graph: GraphFile;
}

export class DatasetError extends Error {
	constructor(message: string, readonly url?: string) {
		super(message);
		this.name = 'DatasetError';
	}
}

export function defaultDatasetSource(): DatasetSource {
	return {
		baseUrl: '/data',
		fetch: (url, init) => fetch(url, init),
		caches: typeof caches !== 'undefined' ? caches : null,
	};
}

function resolve(src: DatasetSource, file: string): string {
	return `${src.baseUrl.replace(/\/+$/, '')}/${file}`;
}

async function openCache(src: DatasetSource): Promise<Cache | null> {
	if (!src.caches) return null;
	try {
		return await src.caches.open(DATA_CACHE_NAME);
	} catch {
		return null;
	}
}

async function fetchText(src: DatasetSource, url: string, init?: RequestInit): Promise<{ text: string; response: Response }> {
	const res = await src.fetch(url, init);
	if (!res.ok) throw new DatasetError(`Failed to load ${url} (HTTP ${res.status})`, url);
	return { text: await res.clone().text(), response: res };
}

/** Immutable (content-hashed) file: Cache Storage first, network second. */
async function fetchHashed(src: DatasetSource, file: string): Promise<string> {
	const url = resolve(src, file);
	const cache = await openCache(src);
	const hit = await cache?.match(url).catch(() => undefined);
	if (hit) return hit.text();
	const { text, response } = await fetchText(src, url);
	if (cache) await cache.put(url, response).catch(() => undefined);
	return text;
}

function parseJson<T>(text: string, url: string): T {
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new DatasetError(`Invalid JSON in ${url}`, url);
	}
}

export function validateManifest(m: unknown): OpeningsManifest {
	const mf = m as Partial<OpeningsManifest> | null;
	if (!mf || typeof mf !== 'object' || !mf.files?.openings || !mf.files.graph) throw new DatasetError('Malformed openings manifest');
	if (mf.version !== SUPPORTED_DATASET_VERSION) throw new DatasetError(`Unsupported dataset version ${String(mf.version)}`);
	return { ...mf, files: { ...mf.files, notes: mf.files.notes ?? {} }, attribution: mf.attribution ?? [] } as OpeningsManifest;
}

/** Network-first manifest; falls back to the last cached copy when offline. */
export async function loadManifest(src: DatasetSource = defaultDatasetSource()): Promise<OpeningsManifest> {
	const url = resolve(src, 'manifest.json');
	const cache = await openCache(src);
	try {
		const { text, response } = await fetchText(src, url, { cache: 'no-cache' });
		const manifest = validateManifest(parseJson(text, url));
		if (cache) await cache.put(url, response).catch(() => undefined);
		return manifest;
	} catch (e) {
		const hit = await cache?.match(url).catch(() => undefined);
		if (hit) return validateManifest(parseJson(await hit.text(), url));
		throw e instanceof DatasetError ? e : new DatasetError(`Openings data unavailable (${(e as Error).message})`, url);
	}
}

/** Every file the manifest references (relative names). */
export function manifestFiles(m: OpeningsManifest): string[] {
	return [m.files.openings, m.files.graph, ...Object.values(m.files.notes)];
}

/** Drop cached dataset files that the current manifest no longer references. */
export async function pruneDatasetCache(m: OpeningsManifest, src: DatasetSource = defaultDatasetSource()): Promise<number> {
	const cache = await openCache(src);
	if (!cache) return 0;
	const keep = new Set([...manifestFiles(m), 'manifest.json'].map((f) => new URL(resolve(src, f), 'http://x').pathname));
	let removed = 0;
	for (const req of await cache.keys()) {
		const path = new URL(req.url, 'http://x').pathname;
		if (!keep.has(path)) {
			await cache.delete(req);
			removed++;
		}
	}
	return removed;
}

/** Manifest + openings + graph. Throws DatasetError when unavailable. */
export async function loadOpeningsDataset(src: DatasetSource = defaultDatasetSource()): Promise<OpeningsDataset> {
	const manifest = await loadManifest(src);
	const [openingsText, graphText] = await Promise.all([fetchHashed(src, manifest.files.openings), fetchHashed(src, manifest.files.graph)]);
	const openings = parseJson<OpeningsFile>(openingsText, manifest.files.openings);
	const graph = parseJson<GraphFile>(graphText, manifest.files.graph);
	if (!Array.isArray(openings.openings) || !Array.isArray(graph.epd)) throw new DatasetError('Malformed openings dataset');
	void pruneDatasetCache(manifest, src).catch(() => undefined);
	return { manifest, openings, openingsText, graph };
}

/** Notes chunk for an ECO letter (A–E). Missing chunk → empty notes. */
export async function loadNotesChunk(manifest: OpeningsManifest, letter: string, src: DatasetSource = defaultDatasetSource()): Promise<NotesFile> {
	const file = manifest.files.notes[letter];
	if (!file) return { version: manifest.version, notes: {} };
	const text = await fetchHashed(src, file);
	const parsed = parseJson<NotesFile>(text, file);
	return { version: parsed.version, notes: parsed.notes ?? {} };
}

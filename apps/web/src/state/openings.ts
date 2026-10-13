// Openings store — the shipped openings dataset (OpeningIndex), its search
// client, dataset notes and recently-viewed openings.
//
// Read:   openingIndex (null until loaded), openingsReady, openingsStatus, openingsError,
//         openingsManifest, openingFamilies, recentOpeningIds, openingSearch()
// Write:  loadOpenings() (idempotent; boot starts it after first paint),
//         markOpeningViewed(id), clearRecentOpenings(), loadDatasetNote(epd)
// Side effects once loaded: setOpeningIdentifier(identifyLine) → live opening name.
// UI wiring (notes slot, focusSearch) is registerOpeningsFeature(), called from app/boot.ts.
import { computed, signal } from '@preact/signals';
import { toEpd } from '@chess/core/chess';
import { OpeningIndex, type NotesFile, type OpeningEntry, type OpeningNote, type OpeningsManifest } from '@chess/core/openings';
import { getRepositories } from '@/services/db';
import {
	createOpeningSearch,
	defaultDatasetSource,
	loadNotesChunk,
	loadOpeningsDataset,
	type DatasetSource,
	type OpeningSearch,
	type OpeningSearchOptions,
} from '@/services/openings';
import { defineStore } from './registry';
import { setOpeningIdentifier } from './openingIdentity';

export type OpeningsStatus = 'idle' | 'loading' | 'ready' | 'error';

export const RECENT_OPENINGS_KEY = 'openings.recent';
export const RECENT_OPENINGS_MAX = 60;
/** Delay before the background dataset load starts (keeps first paint snappy). */
const BOOT_LOAD_DELAY_MS = 300;

export interface OpeningFamily {
	name: string;
	count: number;
}

// ── State ─────────────────────────────────────────────────────────────────
const _index = signal<OpeningIndex | null>(null);
const _status = signal<OpeningsStatus>('idle');
const _error = signal<string | null>(null);
const _manifest = signal<OpeningsManifest | null>(null);
const _recent = signal<string[]>([]);

export const openingIndex = computed(() => _index.value);
export const openingsStatus = computed(() => _status.value);
export const openingsReady = computed(() => _status.value === 'ready' && _index.value !== null);
export const openingsError = computed(() => _error.value);
export const openingsManifest = computed(() => _manifest.value);
/** Recently viewed opening ids, newest first. */
export const recentOpeningIds = computed(() => _recent.value);

/** Families with their opening counts, by name. */
export const openingFamilies = computed<OpeningFamily[]>(() => {
	const idx = _index.value;
	if (!idx) return [];
	const counts = new Map<string, number>();
	for (const e of idx.all()) counts.set(e.family, (counts.get(e.family) ?? 0) + 1);
	return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
});

let search: OpeningSearch | null = null;
let loading: Promise<void> | null = null;
let source: DatasetSource | null = null;
const notesChunks = new Map<string, Promise<NotesFile>>();

/** Search client for the loaded dataset (null until ready). */
export function openingSearch(): OpeningSearch | null {
	return search;
}

export function openingById(id: string): OpeningEntry | undefined {
	return _index.value?.byId(id);
}

// ── Loading ───────────────────────────────────────────────────────────────
export interface LoadOpeningsOptions {
	source?: DatasetSource;
	search?: OpeningSearchOptions;
	/** Reload even when already loaded. */
	force?: boolean;
}

export function loadOpenings(opts: LoadOpeningsOptions = {}): Promise<void> {
	if (loading && !opts.force) return loading;
	source = opts.source ?? defaultDatasetSource();
	const src = source;
	_status.value = 'loading';
	_error.value = null;
	loading = (async () => {
		try {
			const ds = await loadOpeningsDataset(src);
			const index = OpeningIndex.fromData(ds.openings, ds.graph);
			search?.dispose();
			search = createOpeningSearch(ds.openings.openings, ds.openingsText, opts.search);
			notesChunks.clear();
			_manifest.value = ds.manifest;
			_index.value = index;
			_status.value = 'ready';
			setOpeningIdentifier((uci, startFen) => index.identifyLine(uci, startFen));
		} catch (e) {
			console.error('[openings] dataset load failed', e);
			_error.value = (e as Error).message || 'Could not load the openings data';
			_status.value = 'error';
			loading = null;
		}
	})();
	return loading;
}

/** Retry after an error. */
export function retryLoadOpenings(): Promise<void> {
	return loadOpenings({ source: source ?? undefined, force: true });
}

// ── Dataset notes ─────────────────────────────────────────────────────────
/** Dataset (Wikibooks) note for a position, if any. Chunks load lazily and are memoised. */
export async function loadDatasetNote(fenOrEpd: string): Promise<OpeningNote | undefined> {
	const idx = _index.value;
	const manifest = _manifest.value;
	if (!idx || !manifest) return undefined;
	const epd = toEpd(fenOrEpd);
	const letter = idx.notesChunk(epd);
	if (!letter) return undefined;
	let chunk = notesChunks.get(letter);
	if (!chunk) {
		chunk = loadNotesChunk(manifest, letter, source ?? undefined);
		chunk.catch(() => notesChunks.delete(letter));
		notesChunks.set(letter, chunk);
	}
	return (await chunk).notes[epd];
}

// ── Recently viewed ───────────────────────────────────────────────────────
export function markOpeningViewed(id: string): void {
	const next = [id, ..._recent.value.filter((x) => x !== id)].slice(0, RECENT_OPENINGS_MAX);
	_recent.value = next;
	void getRepositories()
		.kv.set(RECENT_OPENINGS_KEY, next)
		.catch((e) => console.error('[openings] could not persist recent', e));
}

export function clearRecentOpenings(): void {
	_recent.value = [];
	void getRepositories().kv.remove(RECENT_OPENINGS_KEY).catch(() => undefined);
}

export async function loadRecentOpenings(): Promise<void> {
	const ids = await getRepositories().kv.get<string[]>(RECENT_OPENINGS_KEY);
	_recent.value = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
}

/** Test helper. */
export function resetOpeningsState(): void {
	search?.dispose();
	search = null;
	loading = null;
	source = null;
	notesChunks.clear();
	_index.value = null;
	_status.value = 'idle';
	_error.value = null;
	_manifest.value = null;
	_recent.value = [];
	setOpeningIdentifier(null);
}

defineStore({
	name: 'openings',
	init: async () => {
		await loadRecentOpenings().catch(() => undefined);
		if (typeof window === 'undefined') return;
		// Never block boot: the dataset (≈7 MB) loads in the background after first paint.
		setTimeout(() => void loadOpenings(), BOOT_LOAD_DELAY_MS);
	},
	dispose: () => search?.dispose(),
});

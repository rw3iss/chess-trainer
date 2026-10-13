import type { EngineAdapter, EngineMeta, RemoteEngineDto } from '@chess/core';

/** The subset of `Worker` the UCI adapters use. Lets tests and Node inject a fake / in-process engine. */
export interface WorkerLike {
	postMessage(message: string): void;
	terminate(): void;
	onmessage: ((ev: { data: unknown }) => void) | null;
	onerror: ((ev: unknown) => void) | null;
}

export type WorkerFactory = (url: string) => WorkerLike;

export const defaultWorkerFactory: WorkerFactory = (url) => new Worker(url) as unknown as WorkerLike;

/** Download progress for on-demand engine assets. */
export interface DownloadProgress {
	loadedBytes: number;
	totalBytes: number;
	/** 0..1 (0 when the total is unknown). */
	fraction: number;
}

export type ProgressCallback = (p: DownloadProgress) => void;

/** Why an engine cannot be used right now. */
export type UnavailableReason =
	| 'needs-download'
	| 'needs-server'
	| 'binary-missing'
	| 'needs-isolation'
	| 'model-missing'
	| 'server-unavailable';

export interface EngineAvailability {
	available: boolean;
	reason?: UnavailableReason;
	/** Human-readable reason for the settings card. */
	message?: string;
	/** Engine can be downloaded (on-demand local engine). */
	downloadable: boolean;
	/** On-demand assets are already in Cache Storage. */
	installed: boolean;
}

export interface EngineEntry {
	meta: EngineMeta;
	availability: EngineAvailability;
}

/** The slice of ApiClient the registry needs. */
export interface EngineListSource {
	listEngines(): Promise<RemoteEngineDto[]>;
}

export type AdapterFactory = () => EngineAdapter | Promise<EngineAdapter>;

/** Thrown / rejected when a queued job is cancelled or the adapter is disposed. */
export class EngineAbortError extends Error {
	constructor(message = 'engine job aborted') {
		super(message);
		this.name = 'EngineAbortError';
	}
}

export const isAbortError = (e: unknown): e is EngineAbortError => e instanceof Error && e.name === 'EngineAbortError';

// Settings → Data helpers: export / import every local record as one JSON
// file, clear fetched-data caches, storage estimate, dataset manifest.
import type { SavedGame, Session } from '@chess/core/game';
import { validateBoardTheme, validatePieceTheme, type BoardTheme, type PieceTheme } from '@chess/core/theme';
import type { FavoriteKind, Repositories } from '@/services/db';

export const BACKUP_FORMAT = 'chess-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
	format: typeof BACKUP_FORMAT;
	version: number;
	exportedAt: string;
	settings: unknown;
	sessions: Session[];
	sessionsMeta: { order: string[]; activeId: string | null } | null;
	savedGames: SavedGame[];
	favorites: { kind: FavoriteKind; refId: string }[];
	notes: { epd: string; text: string }[];
	themes: { board: BoardTheme[]; piece: PieceTheme[] };
}

export async function buildBackup(repos: Repositories, settingsKey = 'app'): Promise<Backup> {
	const [settings, sessions, sessionsMeta, savedGames, favorites, notes, board, piece] = await Promise.all([
		repos.settings.get(settingsKey),
		repos.sessions.list(),
		repos.sessions.getMeta(),
		repos.savedGames.list(),
		repos.favorites.list(),
		repos.notes.list(),
		repos.themes.listBoard(),
		repos.themes.listPiece(),
	]);
	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exportedAt: new Date().toISOString(),
		settings: settings ?? null,
		sessions,
		sessionsMeta: sessionsMeta ?? null,
		savedGames,
		favorites: favorites.map((f) => ({ kind: f.kind, refId: f.refId })),
		notes: notes.map((n) => ({ epd: n.epd, text: n.text })),
		themes: { board, piece },
	};
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/** Parse + shallow-validate a backup file. Throws with a readable message. */
export function parseBackup(text: string): Backup {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('The file is not valid JSON.');
	}
	if (!isObj(data) || data.format !== BACKUP_FORMAT) throw new Error('This is not a chess backup file.');
	if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app.');
	const themes = isObj(data.themes) ? data.themes : {};
	const hasId = (x: unknown): boolean => isObj(x) && typeof x.id === 'string';
	return {
		format: BACKUP_FORMAT,
		version: data.version,
		exportedAt: String(data.exportedAt ?? ''),
		settings: data.settings ?? null,
		sessions: arr(data.sessions).filter((s) => hasId(s) && isObj((s as Session).tree)) as Session[],
		sessionsMeta: isObj(data.sessionsMeta) ? (data.sessionsMeta as Backup['sessionsMeta']) : null,
		savedGames: arr(data.savedGames).filter((g) => hasId(g) && isObj((g as SavedGame).tree)) as SavedGame[],
		favorites: arr(data.favorites).filter((f) => isObj(f) && (f.kind === 'opening' || f.kind === 'game') && typeof f.refId === 'string') as Backup['favorites'],
		notes: arr(data.notes).filter((n) => isObj(n) && typeof n.epd === 'string' && typeof n.text === 'string') as Backup['notes'],
		themes: { board: arr(themes.board).filter(validateBoardTheme), piece: arr(themes.piece).filter(validatePieceTheme) },
	};
}

/** Write a backup into the repositories (merging by id). Reload the app afterwards to refresh stores. */
export async function restoreBackup(repos: Repositories, b: Backup, settingsKey = 'app'): Promise<number> {
	if (b.settings) await repos.settings.set(settingsKey, b.settings);
	if (b.sessions.length) await repos.sessions.putMany(b.sessions);
	if (b.sessionsMeta) await repos.sessions.setMeta(b.sessionsMeta);
	const existing = new Set((await repos.favorites.list()).map((f) => `${f.kind}:${f.refId}`));
	await Promise.all([
		...b.savedGames.map((g) => repos.savedGames.put(g)),
		...b.favorites.filter((f) => !existing.has(`${f.kind}:${f.refId}`)).map((f) => repos.favorites.add(f.kind, f.refId)),
		...b.notes.map((n) => repos.notes.set(n.epd, n.text)),
		...b.themes.board.map((t) => repos.themes.putBoard(t)),
		...b.themes.piece.map((t) => repos.themes.putPiece(t)),
	]);
	return b.sessions.length + b.savedGames.length + b.favorites.length + b.notes.length + b.themes.board.length + b.themes.piece.length;
}

/** Delete runtime Cache Storage entries (keeps the service-worker precache so the app stays offline-ready). */
export async function clearRuntimeCaches(): Promise<number> {
	if (typeof caches === 'undefined') return 0;
	const names = (await caches.keys()).filter((n) => !n.includes('precache'));
	await Promise.all(names.map((n) => caches.delete(n)));
	return names.length;
}

export interface StorageEstimate {
	usage: number;
	quota: number;
}

export async function storageEstimate(): Promise<StorageEstimate | null> {
	const est = await navigator.storage?.estimate?.().catch(() => null);
	return est && typeof est.usage === 'number' ? { usage: est.usage, quota: est.quota ?? 0 } : null;
}

export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	const units = ['KB', 'MB', 'GB'];
	let v = n / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export interface DatasetManifest {
	version: number;
	generatedAt?: string;
	counts?: Record<string, number>;
}

export async function fetchDatasetManifest(base = import.meta.env.BASE_URL ?? '/'): Promise<DatasetManifest | null> {
	try {
		const res = await fetch(`${base.replace(/\/?$/, '/')}data/manifest.json`, { cache: 'no-cache' });
		if (!res.ok) return null;
		return (await res.json()) as DatasetManifest;
	} catch {
		return null;
	}
}

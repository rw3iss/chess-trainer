// One local database per account (docs/plan/ACCOUNTS.md §3A).
//
//   anonymous            → IndexedDB 'chess-openings'                (the device database)
//   account <host|userId> → IndexedDB 'chess-openings@<host>|<userId>'
//
// The DEVICE database (always 'chess-openings') also holds device-level state in its kv table:
//   'account:active'  active account key (null/absent = anonymous)
//   'accounts:known'  KnownAccount[] (switcher list, copy-prompt answers)
//   'auth:session'    tokens of the active account; 'auth:sessions' = stashed tokens of the others
//   guest token + guest name (rooms)
// Stores read their data through getRepositories() (the ACTIVE database) and device state through
// getDeviceRepositories(). Switching accounts writes 'account:active' and reloads the app, so every
// store, timer and the sync service re-initialise against the new database (boot → openActiveDatabase).
import Dexie from 'dexie';
import { ChessDb, DB_NAME } from './schema';
import { createDexieRepositories } from './repositories/dexie';
import type { Repositories } from './repositories/types';
import { setDeviceRepositories, setRepositories } from './index';

export const ACTIVE_ACCOUNT_KEY = 'account:active';
export const KNOWN_ACCOUNTS_KEY = 'accounts:known';
/** Tokens of signed-in accounts that are not active (switching back needs no new sign-in). */
export const AUTH_SESSIONS_STASH_KEY = 'auth:sessions';
/** Legacy single-session key (also the active account's tokens). Kept in sync with state/auth.ts. */
const LEGACY_SESSION_KEY = 'auth:session';
export const ACCOUNT_DB_PREFIX = `${DB_NAME}@`;

export interface KnownAccount {
	/** `${serverHost}|${userId}` */
	key: string;
	serverUrl: string;
	userId: string;
	username: string;
	displayName: string;
	lastUsedAt: number;
	/** Answer to "Copy this device's games and sessions into …?" (absent = not asked yet). */
	copyAnswer?: 'copied' | 'declined';
	/** Avatar as a data URL (shown offline) and the server path it came from (re-fetched when it changes). */
	avatar?: string;
	avatarSrc?: string;
}

/** Host of a server URL (relative URLs resolve against the page origin). */
export function serverHost(serverUrl: string): string {
	const base = typeof location !== 'undefined' ? location.origin : 'http://localhost';
	try {
		return new URL(serverUrl, base).host;
	} catch {
		return serverUrl;
	}
}

export function accountKey(serverUrl: string, userId: string): string {
	return `${serverHost(serverUrl)}|${userId}`;
}

/** IndexedDB name for an account key (null = the anonymous / device database). */
export function accountDbName(key: string | null): string {
	return key ? `${ACCOUNT_DB_PREFIX}${key}` : DB_NAME;
}

interface StoredSessionLike {
	serverUrl: string;
	user: { id: string; role: string };
}

/**
 * Boot: open the device database, pick the active account and bind the repositories.
 * Upgrade path: a device signed in before per-account databases existed has a session but no
 * 'account:active' entry → that account becomes active (its database starts empty; the copy
 * prompt offers to move the device data in).
 */
export async function openActiveDatabase(opts: { open?: (name: string) => Repositories } = {}): Promise<{ device: Repositories; activeKey: string | null }> {
	const open = opts.open ?? ((name: string) => createDexieRepositories(new ChessDb(name)));
	const device = open(DB_NAME);
	const stored = await device.kv.get<string | null>(ACTIVE_ACCOUNT_KEY);
	let activeKey: string | null;
	if (stored === undefined) {
		const legacy = await device.kv.get<StoredSessionLike>(LEGACY_SESSION_KEY);
		activeKey = legacy && legacy.user.role !== 'guest' ? accountKey(legacy.serverUrl, legacy.user.id) : null;
		await device.kv.set(ACTIVE_ACCOUNT_KEY, activeKey);
	} else activeKey = stored;
	const active = activeKey ? open(accountDbName(activeKey)) : device;
	if (activeKey) await seedAccountSettings(device, active, activeKey);
	setDeviceRepositories(activeKey ? device : null);
	setRepositories(active);
	return { device, activeKey };
}

/** Settings record id (state/settings.ts SETTINGS_KEY). */
const SETTINGS_ID = 'app';

/**
 * First open of an account database: start from this device's settings (theme, board, …) with the
 * account's server URL and sync on — the account exists to sync. Later changes stay per account.
 */
async function seedAccountSettings(device: Repositories, account: Repositories, key: string): Promise<void> {
	if ((await account.settings.get(SETTINGS_ID)) !== undefined) return;
	const base = ((await device.settings.get<Record<string, unknown>>(SETTINGS_ID)) ?? {}) as { server?: Record<string, unknown> } & Record<string, unknown>;
	const session = await device.kv.get<StoredSessionLike>(LEGACY_SESSION_KEY);
	const known = (await device.kv.get<KnownAccount[]>(KNOWN_ACCOUNTS_KEY)) ?? [];
	const url = (session && accountKey(session.serverUrl, session.user.id) === key ? session.serverUrl : undefined) ?? known.find((a) => a.key === key)?.serverUrl;
	await account.settings.set(SETTINGS_ID, { ...base, server: { ...base.server, ...(url ? { url } : {}), sync: true } });
}

/** True when the repositories hold games or sessions worth copying. */
export async function hasLocalData(repos: Repositories): Promise<boolean> {
	const [sessions, games] = await Promise.all([repos.sessions.list(), repos.savedGames.list()]);
	return sessions.length > 0 || games.length > 0;
}

/**
 * Copies games, sessions (+ tab order), favorites, custom themes, notes and — when the target has
 * none — settings from one database into another. Ids are kept (the server scopes ids per user),
 * so copying twice does not duplicate.
 */
export async function copyRepositories(from: Repositories, to: Repositories): Promise<{ sessions: number; games: number }> {
	const [sessions, games, favorites, boards, pieces, notes] = await Promise.all([
		from.sessions.list(),
		from.savedGames.list(),
		from.favorites.list(),
		from.themes.listBoard(),
		from.themes.listPiece(),
		from.notes.list(),
	]);
	if (sessions.length) await to.sessions.putMany(sessions);
	const [srcMeta, dstMeta] = await Promise.all([from.sessions.getMeta(), to.sessions.getMeta()]);
	if (srcMeta) {
		const order = [...(dstMeta?.order ?? []), ...srcMeta.order.filter((id) => !dstMeta?.order.includes(id))];
		await to.sessions.setMeta({ order, activeId: dstMeta?.activeId ?? srcMeta.activeId });
	}
	for (const g of games) await to.savedGames.put(g);
	for (const f of favorites) if (!(await to.favorites.has(f.kind, f.refId))) await to.favorites.add(f.kind, f.refId);
	for (const t of boards) await to.themes.putBoard(t);
	for (const t of pieces) await to.themes.putPiece(t);
	for (const n of notes) if (n.text.trim()) await to.notes.set(n.epd, n.text);
	const settings = await from.settings.get<unknown>('app');
	if (settings !== undefined && (await to.settings.get<unknown>('app')) === undefined) await to.settings.set('app', settings);
	return { sessions: sessions.length, games: games.length };
}

/** Deletes an account's local database. */
export function deleteAccountDatabase(key: string): Promise<void> {
	return Dexie.delete(accountDbName(key));
}

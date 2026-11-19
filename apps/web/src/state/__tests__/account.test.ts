import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthTokens, UserDto } from '@chess/core/protocol';
import { createSession } from '@chess/core/game';
import { ChessDb, createDexieRepositories, getDeviceRepositories, getRepositories, setDeviceRepositories, type Repositories } from '@/services/db';
import { ACTIVE_ACCOUNT_KEY, AUTH_SESSIONS_STASH_KEY, KNOWN_ACCOUNTS_KEY, accountDbName, accountKey, copyRepositories, openActiveDatabase } from '@/services/db/accounts';
import { AUTH_SESSION_KEY, authActions, configureAuth, loadAuth, resetAuthState, type StoredAuth } from '@/state/auth';
import { accountActions, activeAccountKey, configureAccount, copyPrompt, knownAccounts, loadAccounts, resetAccountState } from '@/state/account';

const URL_ = 'http://srv';
const userA: UserDto = { id: 'a', username: 'alice', displayName: 'Alice', role: 'user' };
const userB: UserDto = { id: 'b', username: 'bob', displayName: 'Bob', role: 'user' };
const tokensFor = (user: UserDto, n: number): AuthTokens => ({ accessToken: `acc-${user.id}-${n}`, refreshToken: `ref-${user.id}-${n}`, expiresIn: 900, user });
const stored = (user: UserDto): StoredAuth => ({ accessToken: `acc-${user.id}`, refreshToken: `ref-${user.id}`, expiresAt: Date.now() + 900_000, user, serverUrl: URL_ });

let run = 0;
/** Databases of one test, by logical name (unique per test so fake-indexeddb state never leaks). */
function dbFactory() {
	const prefix = `acct-test-${run++}-`;
	const dbs = new Map<string, Repositories>();
	const open = (name: string) => {
		let r = dbs.get(name);
		if (!r) dbs.set(name, (r = createDexieRepositories(new ChessDb(prefix + name))));
		return r;
	};
	return { open, dbs };
}

describe('per-account local databases', () => {
	let f: ReturnType<typeof dbFactory>;
	let reload: ReturnType<typeof vi.fn<(to?: string) => void>>;
	let user = userA;

	beforeEach(() => {
		f = dbFactory();
		reload = vi.fn<(to?: string) => void>();
		resetAuthState();
		resetAccountState();
		configureAccount({ reload });
		user = userA;
		configureAuth({
			client: () => ({ login: async () => tokensFor(user, 1), refresh: async () => tokensFor(user, 2), guest: async () => tokensFor(user, 3) }),
			serverUrl: () => URL_,
		});
	});

	afterEach(() => {
		configureAuth();
		configureAccount();
		resetAuthState();
		resetAccountState();
		setDeviceRepositories(null);
	});

	/** Boot as the app does: open the active database, then restore auth + accounts. */
	async function boot() {
		const r = await openActiveDatabase({ open: f.open });
		await loadAuth();
		await loadAccounts();
		return r;
	}

	it('anonymous: the device database is the active one', async () => {
		const { activeKey } = await boot();
		expect(activeKey).toBeNull();
		expect(getRepositories()).toBe(f.open(accountDbName(null)));
		expect(getDeviceRepositories()).toBe(getRepositories());
		expect(activeAccountKey.value).toBeNull();
	});

	it('upgrade: a device signed in before per-account databases opens that account (empty) and offers to copy', async () => {
		const device = f.open(accountDbName(null));
		await device.kv.set(AUTH_SESSION_KEY, stored(userA));
		await device.sessions.putMany([createSession({ id: 's1' })]);
		await device.settings.set('app', { theme: 'x', server: { url: 'http://other', sync: false } });
		const { activeKey } = await boot();
		expect(activeKey).toBe(accountKey(URL_, 'a'));
		expect(getRepositories()).toBe(f.open(accountDbName('srv|a')));
		expect(getDeviceRepositories()).toBe(device);
		expect(await getRepositories().sessions.list()).toHaveLength(0);
		// The new account database starts from the device settings, with its server and sync on.
		expect(await getRepositories().settings.get('app')).toEqual({ theme: 'x', server: { url: URL_, sync: true } });
		expect(knownAccounts.value.map((a) => a.username)).toEqual(['alice']);
		expect(copyPrompt.value?.key).toBe('srv|a');

		await accountActions.answerCopy(true);
		expect((await getRepositories().sessions.list()).map((s) => s.id)).toEqual(['s1']);
		expect((await device.kv.get<{ copyAnswer?: string }[]>(KNOWN_ACCOUNTS_KEY))?.[0]?.copyAnswer).toBe('copied');
		expect(reload).toHaveBeenCalledTimes(1);
		// Answered: no prompt on the next boot.
		resetAccountState();
		await loadAccounts();
		expect(copyPrompt.value).toBeNull();
	});

	it('sign-in from anonymous switches to the account database (reload); sign-out returns to anonymous', async () => {
		await boot();
		await authActions.login('alice', 'pw');
		const device = f.open(accountDbName(null));
		expect(await device.kv.get(ACTIVE_ACCOUNT_KEY)).toBe('srv|a');
		expect((await device.kv.get<StoredAuth>(AUTH_SESSION_KEY))?.user.id).toBe('a');
		expect(reload).toHaveBeenLastCalledWith(undefined);
		expect(knownAccounts.value.map((a) => a.key)).toEqual(['srv|a']);

		// Next boot: alice's database.
		resetAuthState();
		resetAccountState();
		await boot();
		expect(activeAccountKey.value).toBe('srv|a');
		await authActions.logout();
		expect(await device.kv.get(ACTIVE_ACCOUNT_KEY)).toBeNull();
		expect(await device.kv.get(AUTH_SESSION_KEY)).toBeUndefined();
		expect(reload).toHaveBeenCalledTimes(2);
	});

	it('signing in as another account stashes the first session; switching back restores it without a sign-in', async () => {
		const device = f.open(accountDbName(null));
		await device.kv.set(ACTIVE_ACCOUNT_KEY, 'srv|a');
		await device.kv.set(AUTH_SESSION_KEY, stored(userA));
		await boot();
		user = userB;
		await authActions.login('bob', 'pw');
		expect(await device.kv.get(ACTIVE_ACCOUNT_KEY)).toBe('srv|b');
		expect((await device.kv.get<Record<string, StoredAuth>>(AUTH_SESSIONS_STASH_KEY))?.['srv|a']?.user.id).toBe('a');

		resetAuthState();
		resetAccountState();
		await boot();
		expect(activeAccountKey.value).toBe('srv|b');
		await accountActions.switchTo('srv|a');
		expect(await device.kv.get(ACTIVE_ACCOUNT_KEY)).toBe('srv|a');
		expect((await device.kv.get<StoredAuth>(AUTH_SESSION_KEY))?.user.id).toBe('a');
		const stash = await device.kv.get<Record<string, StoredAuth>>(AUTH_SESSIONS_STASH_KEY);
		expect(stash?.['srv|b']?.user.id).toBe('b');
		expect(stash?.['srv|a']).toBeUndefined();

		// To anonymous: the current session is stashed, none is active.
		resetAuthState();
		resetAccountState();
		await boot();
		await accountActions.switchTo(null);
		expect(await device.kv.get(ACTIVE_ACCOUNT_KEY)).toBeNull();
		expect(await device.kv.get(AUTH_SESSION_KEY)).toBeUndefined();
		expect((await device.kv.get<Record<string, StoredAuth>>(AUTH_SESSIONS_STASH_KEY))?.['srv|a']?.user.id).toBe('a');
	});

	it('data stays separate per account', async () => {
		await boot();
		await getRepositories().sessions.putMany([createSession({ id: 'anon-1' })]);
		const a = f.open(accountDbName('srv|a'));
		await a.sessions.putMany([createSession({ id: 'alice-1' })]);
		expect((await a.sessions.list()).map((s) => s.id)).toEqual(['alice-1']);
		expect((await f.open(accountDbName(null)).sessions.list()).map((s) => s.id)).toEqual(['anon-1']);
	});

	it('removeFromDevice forgets a non-active account', async () => {
		const device = f.open(accountDbName(null));
		await device.kv.set(ACTIVE_ACCOUNT_KEY, 'srv|a');
		await device.kv.set(AUTH_SESSION_KEY, stored(userA));
		await device.kv.set(AUTH_SESSIONS_STASH_KEY, { 'srv|b': stored(userB) });
		await device.kv.set(KNOWN_ACCOUNTS_KEY, [
			{ key: 'srv|a', serverUrl: URL_, userId: 'a', username: 'alice', displayName: 'Alice', lastUsedAt: 2 },
			{ key: 'srv|b', serverUrl: URL_, userId: 'b', username: 'bob', displayName: 'Bob', lastUsedAt: 1 },
		]);
		await boot();
		await accountActions.removeFromDevice('srv|b');
		expect(knownAccounts.value.map((a) => a.key)).toEqual(['srv|a']);
		expect((await device.kv.get<Record<string, StoredAuth>>(AUTH_SESSIONS_STASH_KEY))?.['srv|b']).toBeUndefined();
		expect(reload).not.toHaveBeenCalled();
	});
});

describe('copyRepositories', () => {
	it('copies games, sessions (tab order), favorites, notes; settings only when the target has none', async () => {
		const f = dbFactory();
		const from = f.open('from');
		const to = f.open('to');
		await from.sessions.putMany([createSession({ id: 's1' }), createSession({ id: 's2' })]);
		await from.sessions.setMeta({ order: ['s1', 's2'], activeId: 's2' });
		await to.sessions.setMeta({ order: ['t1'], activeId: 't1' });
		await from.favorites.add('opening', 'o1');
		await from.notes.set('epd', 'note');
		await from.settings.set('app', { v: 'from' });
		await to.settings.set('app', { v: 'to' });
		const n = await copyRepositories(from, to);
		expect(n).toEqual({ sessions: 2, games: 0 });
		expect((await to.sessions.list()).map((s) => s.id).sort()).toEqual(['s1', 's2']);
		expect(await to.sessions.getMeta()).toEqual({ order: ['t1', 's1', 's2'], activeId: 't1' });
		expect(await to.favorites.has('opening', 'o1')).toBe(true);
		expect((await to.notes.get('epd'))?.text).toBe('note');
		expect(await to.settings.get('app')).toEqual({ v: 'to' });
		// Twice: no duplicates.
		await copyRepositories(from, to);
		expect(await to.sessions.list()).toHaveLength(2);
	});
});

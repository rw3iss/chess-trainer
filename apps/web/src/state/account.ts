// Account store — which local database is active, the accounts known on this device, switching,
// and the one-time "copy this device's data" prompt (docs/plan/ACCOUNTS.md §3A).
//
// Read:   activeAccountKey, activeAccount, knownAccounts, copyPrompt
// Write:  accountActions.switchTo(key | null) / signOut() / removeFromDevice(key) / answerCopy(copy)
//
// Storage: see services/db/accounts.ts (device kv: 'account:active', 'accounts:known', 'auth:sessions').
// A switch persists the choice, flushes every store and reloads the app (or navigates to `to`), so all
// stores, timers and sync re-initialise against the new database. Sign-in flows (login, register,
// password reset, Google) reach here through auth's session listener.
import { computed, signal } from '@preact/signals';
import { getDeviceRepositories, getRepositories } from '@/services/db';
import {
	ACTIVE_ACCOUNT_KEY,
	AUTH_SESSIONS_STASH_KEY,
	KNOWN_ACCOUNTS_KEY,
	accountKey,
	copyRepositories,
	deleteAccountDatabase,
	hasLocalData,
	type KnownAccount,
} from '@/services/db/accounts';
import { toast } from '@/services/toast';
import { AUTH_SESSION_KEY, authUser, setSessionListener, type StoredAuth } from './auth';
import { defineStore, flushStores } from './registry';

export type { KnownAccount } from '@/services/db/accounts';

/** sessionStorage key: a toast to show after the switch reload. */
export const PENDING_TOAST_KEY = 'chess:pending-toast';

export interface AccountDeps {
	/** Reload the app (default location.reload) or go to `to` (location.assign). */
	reload: (to?: string) => void;
	now: () => number;
}
const defaultDeps: AccountDeps = {
	reload: (to) => (to ? window.location.assign(to) : window.location.reload()),
	now: () => Date.now(),
};
let deps: AccountDeps = defaultDeps;

/** Test hook. */
export function configureAccount(next: Partial<AccountDeps> = {}): void {
	deps = { ...defaultDeps, ...next };
}

// undefined = not resolved (single-database mode: tests without boot); null = anonymous.
const _active = signal<string | null | undefined>(undefined);
const _known = signal<KnownAccount[]>([]);
const _copyPrompt = signal<KnownAccount | null>(null);
const _switching = signal(false);

export const activeAccountKey = computed(() => _active.value);
export const knownAccounts = computed(() => [..._known.value].sort((a, b) => b.lastUsedAt - a.lastUsedAt));
export const activeAccount = computed(() => (_active.value ? (_known.value.find((a) => a.key === _active.value) ?? null) : null));
/** Account whose (empty) database could take this device's anonymous data; null = no prompt. */
export const copyPrompt = computed(() => _copyPrompt.value);
export const accountSwitching = computed(() => _switching.value);

function deviceKv() {
	return getDeviceRepositories().kv;
}

async function saveKnown(list: KnownAccount[]): Promise<void> {
	_known.value = list;
	await deviceKv().set(KNOWN_ACCOUNTS_KEY, list);
}

function upsert(list: KnownAccount[], s: StoredAuth, now: number): KnownAccount[] {
	const key = accountKey(s.serverUrl, s.user.id);
	const prev = list.find((a) => a.key === key);
	const next: KnownAccount = { ...prev, key, serverUrl: s.serverUrl, userId: s.user.id, username: s.user.username, displayName: s.user.displayName, lastUsedAt: now };
	return [...list.filter((a) => a.key !== key), next];
}

async function stash(): Promise<Record<string, StoredAuth>> {
	return (await deviceKv().get<Record<string, StoredAuth>>(AUTH_SESSIONS_STASH_KEY)) ?? {};
}

/** Persist the target and reload. `session` = tokens to make active (null = none). */
async function go(target: string | null, session: StoredAuth | null, opts: { to?: string; toast?: string } = {}): Promise<void> {
	_switching.value = true;
	const kv = deviceKv();
	if (session) await kv.set(AUTH_SESSION_KEY, session);
	else await kv.remove(AUTH_SESSION_KEY);
	await kv.set(ACTIVE_ACCOUNT_KEY, target);
	await flushStores();
	if (opts.toast) {
		try {
			sessionStorage.setItem(PENDING_TOAST_KEY, opts.toast);
		} catch {
			/* private mode */
		}
	}
	_active.value = target;
	deps.reload(opts.to);
}

/** Called by auth when a sign-in established a session. Switches database when it is another account. */
async function onSignedIn(next: StoredAuth, previous: StoredAuth | null, opts: { to?: string; toast?: string }): Promise<boolean> {
	const key = accountKey(next.serverUrl, next.user.id);
	await saveKnown(upsert(_known.value, next, deps.now()));
	// Same database, or single-database mode (tests without boot): nothing to switch.
	if (_active.value === undefined || _active.value === key) return false;
	// Keep the tokens of the account we leave, so switching back needs no sign-in.
	if (previous && previous.user.role !== 'guest') {
		const prevKey = accountKey(previous.serverUrl, previous.user.id);
		if (prevKey !== key) {
			const s = await stash();
			s[prevKey] = previous;
			delete s[key];
			await deviceKv().set(AUTH_SESSIONS_STASH_KEY, s);
		}
	}
	await go(key, next, opts);
	return true;
}

export const accountActions = {
	/** Switch to a known account (its stashed tokens, else signed out on its offline data) or to anonymous (null). */
	async switchTo(key: string | null, opts: { to?: string } = {}): Promise<void> {
		if (_active.value === undefined || key === _active.value) return;
		const kv = deviceKv();
		const s = await stash();
		const current = await kv.get<StoredAuth>(AUTH_SESSION_KEY);
		if (current && _active.value) s[_active.value] = current;
		const target = key ? (s[key] ?? null) : null;
		if (key) delete s[key];
		await kv.set(AUTH_SESSIONS_STASH_KEY, s);
		if (key) {
			const a = _known.value.find((x) => x.key === key);
			if (a) await saveKnown(_known.value.map((x) => (x.key === key ? { ...x, lastUsedAt: deps.now() } : x)));
		}
		await go(key, target, { ...opts, toast: key ? `Switched to ${_known.value.find((a) => a.key === key)?.displayName ?? 'account'}` : 'Switched to anonymous' });
	},

	/** Sign out: forget this account's tokens and return to the anonymous database (the account's data stays on the device). */
	async signOut(): Promise<void> {
		if (_active.value === undefined) {
			await deviceKv().remove(AUTH_SESSION_KEY);
			return;
		}
		await go(null, null, { toast: 'Signed out' });
	},

	/** Delete an account's local database and forget it on this device. */
	async removeFromDevice(key: string): Promise<void> {
		const s = await stash();
		delete s[key];
		await deviceKv().set(AUTH_SESSIONS_STASH_KEY, s);
		await saveKnown(_known.value.filter((a) => a.key !== key));
		if (_active.value === key) {
			await go(null, null, { toast: 'Removed from this device' });
			// The database is deleted on the next boot (it is open now).
			await deviceKv().set('account:pendingDelete', key);
			return;
		}
		await deleteAccountDatabase(key);
	},

	/** Answer the copy prompt. Copy → the device's anonymous data goes into this account, then reload. */
	async answerCopy(copy: boolean): Promise<void> {
		const a = _copyPrompt.value;
		if (!a) return;
		_copyPrompt.value = null;
		await saveKnown(_known.value.map((x) => (x.key === a.key ? { ...x, copyAnswer: copy ? 'copied' : 'declined' } : x)));
		if (!copy) return;
		const n = await copyRepositories(getDeviceRepositories(), getRepositories());
		await go(a.key, (await deviceKv().get<StoredAuth>(AUTH_SESSION_KEY)) ?? null, { toast: `Copied ${n.games} games and ${n.sessions} sessions` });
	},
};

/** Boot (after services/db/accounts openActiveDatabase): known accounts, pending toast, copy prompt. */
export async function loadAccounts(): Promise<void> {
	const kv = deviceKv();
	const [active, known, session, pendingDelete] = await Promise.all([
		kv.get<string | null>(ACTIVE_ACCOUNT_KEY),
		kv.get<KnownAccount[]>(KNOWN_ACCOUNTS_KEY),
		kv.get<StoredAuth>(AUTH_SESSION_KEY),
		kv.get<string>('account:pendingDelete'),
	]);
	let list = known ?? [];
	// Upgrade path / first boot after sign-in: the active account must be in the list.
	if (active && session && accountKey(session.serverUrl, session.user.id) === active && !list.some((a) => a.key === active)) {
		list = upsert(list, session, deps.now());
		await kv.set(KNOWN_ACCOUNTS_KEY, list);
	}
	_known.value = list;
	_active.value = active === undefined ? undefined : active;
	if (pendingDelete && pendingDelete !== active) {
		await kv.remove('account:pendingDelete');
		await deleteAccountDatabase(pendingDelete).catch(() => undefined);
	}
	try {
		const msg = sessionStorage.getItem(PENDING_TOAST_KEY);
		if (msg) {
			sessionStorage.removeItem(PENDING_TOAST_KEY);
			toast.success(msg);
		}
	} catch {
		/* private mode */
	}
	const acc = active ? list.find((a) => a.key === active) : undefined;
	if (acc && !acc.copyAnswer && getDeviceRepositories() !== getRepositories() && (await hasLocalData(getDeviceRepositories()))) {
		_copyPrompt.value = acc;
	}
}

/** Test helper. */
export function resetAccountState(): void {
	_active.value = undefined;
	_known.value = [];
	_copyPrompt.value = null;
	_switching.value = false;
}

/** Test helper: set the resolved active key (as boot would). */
export function setActiveAccountKeyForTests(key: string | null | undefined): void {
	_active.value = key;
}

setSessionListener({
	signedIn: onSignedIn,
	signedOut: () => accountActions.signOut(),
});

// The display name in the list follows the signed-in user's profile.
export const activeDisplayName = computed(() => authUser.value?.displayName ?? activeAccount.value?.displayName ?? null);

defineStore({ name: 'account', init: loadAccounts });

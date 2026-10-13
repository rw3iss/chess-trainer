// ServerSettingsSection — the "Server" settings section: server URL + status,
// sign-in / account, sync toggle + status, guest name for online rooms.
// Mounted lazily by the Settings page: `import('@/components/server')`.
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Badge, Button, Input, Toggle, type BadgeTone } from '@/components/common';
import { formatRelativeTime } from '@/lib/format';
import { serverConnector, type ServerStatus } from '@/services/server';
import { lastSyncAt, lastSyncError, syncNow, syncStatus, type SyncStatus } from '@/state/sync';
import { authActions, authBusy, authError, authUser, guestName, isLoggedIn } from '@/state/auth';
import { settings, updateSettings } from '@/state/settings';
import './ServerSettingsSection.scss';

const TICK_MS = 30_000;

const SERVER_BADGE: Record<ServerStatus, { tone: BadgeTone; label: string }> = {
	online: { tone: 'success', label: 'Online' },
	offline: { tone: 'danger', label: 'Unreachable' },
	unconfigured: { tone: 'neutral', label: 'Not configured' },
};

const SYNC_BADGE: Record<SyncStatus, { tone: BadgeTone; label: string }> = {
	idle: { tone: 'success', label: 'Up to date' },
	syncing: { tone: 'info', label: 'Syncing…' },
	error: { tone: 'danger', label: 'Failed' },
	disabled: { tone: 'neutral', label: 'Off' },
	offline: { tone: 'warn', label: 'Waiting for server' },
};

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', user: 'User', guest: 'Guest' };

/** Re-render periodically so relative times stay fresh. */
function useNow(ms = TICK_MS): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), ms);
		return () => clearInterval(t);
	}, [ms]);
	return now;
}

function ConnectionCard(): JSX.Element {
	const saved = settings.value.server.url;
	const [draft, setDraft] = useState(saved);
	useEffect(() => setDraft(saved), [saved]);
	const status = serverConnector.status.value;
	const health = serverConnector.health.value;
	const checking = serverConnector.checking.value;
	const checkedAt = serverConnector.lastCheckedAt.value;
	const now = useNow();
	const badge = SERVER_BADGE[status];

	const commit = () => {
		const url = draft.trim().replace(/\/+$/, '');
		if (url !== saved) updateSettings({ server: { url } });
		else if (url) void serverConnector.probe();
	};

	return (
		<section class="server-settings__card" aria-labelledby="server-settings-connection">
			<header class="server-settings__card-head">
				<h3 class="server-settings__card-title" id="server-settings-connection">
					Connection
				</h3>
				<Badge tone={badge.tone}>
					{badge.label}
				</Badge>
			</header>
			<form
				class="server-settings__url"
				onSubmit={(e) => {
					e.preventDefault();
					commit();
				}}
			>
				<Input
					label="Server URL"
					icon="server"
					type="url"
					inputMode="url"
					autoComplete="url"
					spellcheck={false}
					placeholder="https://chess.example.com"
					value={draft}
					hint="Leave empty to work offline only."
					onInput={(e) => setDraft(e.currentTarget.value)}
					onBlur={commit}
				/>
				<Button type="submit" variant="secondary" loading={checking} disabled={!draft.trim()} class="server-settings__check">
					Check
				</Button>
			</form>
			<p class="server-settings__meta">
				{status === 'online' && health ? (
					<>
						<span class="server-settings__strong">{health.name}</span>
						<span class="server-settings__mono">v{health.version}</span>
					</>
				) : status === 'offline' ? (
					<span>No answer from the server. The app keeps working offline.</span>
				) : (
					<span>No server configured. Everything stays on this device.</span>
				)}
				{checkedAt && status !== 'unconfigured' && <span class="server-settings__subtle">· checked {formatRelativeTime(checkedAt, now)}</span>}
			</p>
		</section>
	);
}

function AccountCard(): JSX.Element {
	const online = serverConnector.status.value === 'online';
	const authFeature = serverConnector.health.value?.features.auth ?? true;
	const user = authUser.value;
	const busy = authBusy.value;
	const error = authError.value;
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');

	if (user && isLoggedIn.value) {
		return (
			<section class="server-settings__card" aria-labelledby="server-settings-account">
				<header class="server-settings__card-head">
					<h3 class="server-settings__card-title" id="server-settings-account">
						Account
					</h3>
					<Badge tone="accent">{ROLE_LABEL[user.role] ?? user.role}</Badge>
				</header>
				<div class="server-settings__user">
					<span class="server-settings__avatar" aria-hidden="true">
						{(user.displayName || user.username).slice(0, 1).toUpperCase()}
					</span>
					<span class="server-settings__user-text">
						<span class="server-settings__user-name">{user.displayName || user.username}</span>
						<span class="server-settings__subtle">@{user.username}</span>
					</span>
					<Button variant="ghost" size="sm" onClick={() => void authActions.logout()}>
						Sign out
					</Button>
				</div>
			</section>
		);
	}

	const disabled = !online || !authFeature;
	return (
		<section class="server-settings__card" aria-labelledby="server-settings-account">
			<header class="server-settings__card-head">
				<h3 class="server-settings__card-title" id="server-settings-account">
					Account
				</h3>
			</header>
			<p class="server-settings__text">
				{!online
					? 'Connect to a server to sign in. Sign-in enables sync, server engines and online rooms.'
					: !authFeature
						? 'This server does not offer accounts.'
						: 'Sign in to sync your games and sessions between devices.'}
			</p>
			<form
				class="server-settings__login"
				onSubmit={(e) => {
					e.preventDefault();
					if (!username.trim() || !password) return;
					void authActions.login(username, password).then(
						() => setPassword(''),
						() => undefined,
					);
				}}
			>
				<Input
					label="Username"
					icon="user"
					autoComplete="username"
					autoCapitalize="none"
					spellcheck={false}
					value={username}
					disabled={disabled}
					onInput={(e) => {
						setUsername(e.currentTarget.value);
						if (error) authActions.clearError();
					}}
				/>
				<Input
					label="Password"
					type="password"
					autoComplete="current-password"
					value={password}
					disabled={disabled}
					error={error ?? undefined}
					onInput={(e) => {
						setPassword(e.currentTarget.value);
						if (error) authActions.clearError();
					}}
				/>
				<Button type="submit" variant="primary" loading={busy} disabled={disabled || !username.trim() || !password} class="server-settings__submit">
					Sign in
				</Button>
			</form>
		</section>
	);
}

function SyncCard(): JSX.Element {
	const enabled = settings.value.server.sync;
	const loggedIn = isLoggedIn.value;
	const status = syncStatus.value;
	const last = lastSyncAt.value;
	const error = lastSyncError.value;
	const now = useNow();
	const badge = !enabled ? SYNC_BADGE.disabled : !loggedIn ? { tone: 'neutral' as BadgeTone, label: 'Sign in first' } : SYNC_BADGE[status];
	const canSync = enabled && loggedIn && (status === 'idle' || status === 'error');

	return (
		<section class="server-settings__card" aria-labelledby="server-settings-sync">
			<header class="server-settings__card-head">
				<h3 class="server-settings__card-title" id="server-settings-sync">
					Sync
				</h3>
				<Badge tone={badge.tone}>
					{badge.label}
				</Badge>
			</header>
			<Toggle
				checked={enabled}
				disabled={!loggedIn && !enabled}
				label="Sync saved games and open sessions"
				description="Newest change wins. Deletions sync too."
				onChange={(v) => updateSettings({ server: { sync: v } })}
			/>
			<div class="server-settings__sync-row">
				<span class="server-settings__subtle">{last ? `Last synced ${formatRelativeTime(last, now)}` : 'Not synced yet'}</span>
				<Button variant="secondary" size="sm" icon="upload" loading={status === 'syncing'} disabled={!canSync} onClick={() => void syncNow()}>
					Sync now
				</Button>
			</div>
			{error && status === 'error' && (
				<p class="server-settings__error" role="alert">
					{error}
				</p>
			)}
		</section>
	);
}

function GuestCard(): JSX.Element {
	const saved = guestName.value;
	const [draft, setDraft] = useState(saved);
	useEffect(() => setDraft(saved), [saved]);
	const commit = () => {
		if (draft.trim() !== saved) void authActions.setGuestName(draft);
	};
	return (
		<section class="server-settings__card" aria-labelledby="server-settings-guest">
			<header class="server-settings__card-head">
				<h3 class="server-settings__card-title" id="server-settings-guest">
					Guest name
				</h3>
			</header>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					commit();
				}}
			>
				<Input
					label="Name in online rooms"
					maxLength={40}
					placeholder="Guest"
					value={draft}
					hint={isLoggedIn.value ? 'Not used while you are signed in.' : 'Shown to other players when you are not signed in.'}
					onInput={(e) => setDraft(e.currentTarget.value)}
					onBlur={commit}
				/>
			</form>
		</section>
	);
}

export function ServerSettingsSection(): JSX.Element {
	return (
		<div class="server-settings">
			<header class="server-settings__head">
				<h2 class="server-settings__title">Server</h2>
				<p class="server-settings__lead">Optional. Without a server the app works fully offline; with one you get sign-in, sync, server engines and online rooms.</p>
			</header>
			<div class="server-settings__grid">
				<ConnectionCard />
				<AccountCard />
				<SyncCard />
				<GuestCard />
			</div>
		</div>
	);
}

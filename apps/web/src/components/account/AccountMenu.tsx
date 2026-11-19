// Header account menu: who is active (picture or initials), switch between accounts when this device knows
// more than one, profile, sign in / create account, server settings, sign out (state/account.ts).
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { Icon } from '@/components/common/Icon';
import { Menu, type MenuItem } from '@/components/common/Menu';
import { serverConnector } from '@/services/server';
import { accountActions, activeAccount, activeAccountKey, knownAccounts } from '@/state/account';
import { authActions, authUser, isLoggedIn } from '@/state/auth';
import { cx } from '@/lib/classNames';
import { activeAvatarSrc, initials } from './Avatar';
import './account.scss';

export { initials } from './Avatar';

export function AccountMenu({ compact = false }: { compact?: boolean }): JSX.Element {
	const { route } = useLocation();
	const active = activeAccount.value;
	const activeKey = activeAccountKey.value;
	const user = authUser.value;
	const signedIn = isLoggedIn.value && !!user;
	const name = user?.displayName || active?.displayName || null;
	const signupMode = serverConnector.status.value === 'online' ? (serverConnector.health.value?.features?.signup ?? 'off') : 'off';
	const multi = activeKey !== undefined;

	// One space at a time: signed in = your account (Sign out returns to the device's anonymous space);
	// not signed in = "Anonymous (this device)". Other accounts on this device are listed only when there
	// is more than one, to switch between them.
	const items: MenuItem[] = [{ heading: name ? (signedIn ? `Signed in as ${name}` : `${name} (signed out)`) : 'Anonymous (this device)' }];
	const accounts = multi ? knownAccounts.value : [];
	if (accounts.length > 1) {
		for (const a of accounts) {
			items.push({ id: `acc:${a.key}`, label: `${a.displayName} (@${a.username})`, icon: 'user', checked: a.key === activeKey, onSelect: () => void accountActions.switchTo(a.key) });
		}
		items.push({ separator: true });
	}
	if (signedIn) items.push({ id: 'profile', label: 'Profile', icon: 'user', onSelect: () => route('/profile') });
	else {
		items.push({ id: 'signin', label: active ? 'Sign in again' : 'Sign in', icon: 'user', onSelect: () => route('/profile') });
		if (signupMode !== 'off') items.push({ id: 'signup', label: 'Create account', icon: 'plus', onSelect: () => route('/signup') });
	}
	items.push({ id: 'settings', label: 'Server settings', icon: 'settings', onSelect: () => route('/settings/server') });
	if (signedIn) items.push({ id: 'signout', label: 'Sign out', icon: 'close', onSelect: () => void authActions.logout() });
	// An account whose sign-in expired: leave it for the device's anonymous space.
	else if (active) items.push({ id: 'signout', label: 'Sign out', icon: 'close', onSelect: () => void accountActions.signOut() });

	const label = name ? `Account: ${name}` : 'Account: anonymous';
	const picture = name ? activeAvatarSrc() : null;
	return (
		<Menu
			items={items}
			align="end"
			ariaLabel="Account"
			minWidth={240}
			trigger={(p) => (
				<button {...p} type="button" title={label} class={cx('account-trigger', compact && 'account-trigger--compact', signedIn && 'account-trigger--signed-in')} aria-label={label}>
					{picture ? (
						<img class="account-trigger__img" src={picture} alt="" />
					) : name ? (
						<span class="account-trigger__initials">{initials(name)}</span>
					) : (
						<Icon name="user" size={16} />
					)}
				</button>
			)}
		/>
	);
}

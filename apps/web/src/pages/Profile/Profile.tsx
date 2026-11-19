// /profile — everything about the account in one place: picture, name, email (+ verification), password,
// recovery codes, devices, linked sign-ins (Google, Lichess), invites, export / remove / delete, owner tools.
// Signed out: the sign-in panel (+ export of this device's data). Server-side parts need the server online;
// export and "remove from this device" work offline.
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Badge, Button } from '@/components/common';
import {
	AccountEmailForm,
	Avatar,
	AvatarEditor,
	ChangePasswordForm,
	DataSection,
	DeviceSessions,
	DisplayNameForm,
	ExportData,
	InviteFriend,
	LinkedSignIns,
	OwnerTools,
	RecoveryCodes,
	SignInPanel,
	activeAvatarSrc,
} from '@/components/account';
import { serverConnector } from '@/services/server';
import { accountActions } from '@/state/account';
import { authActions, authUser, isLoggedIn } from '@/state/auth';
import './Profile.scss';

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', user: 'Member', guest: 'Guest' };

interface NavItem {
	id: string;
	label: string;
}

function SectionNav({ items }: { items: NavItem[] }): JSX.Element {
	return (
		<nav class="profile__nav" aria-label="Profile sections">
			{items.map((i) => (
				<a key={i.id} class="profile__nav-link" href={`#${i.id}`} onClick={(e) => {
					e.preventDefault();
					document.getElementById(i.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
					history.replaceState(history.state, '', `#${i.id}`);
				}}>
					{i.label}
				</a>
			))}
		</nav>
	);
}

function Section({ id, title, children }: { id: string; title: string; children: preact.ComponentChildren }): JSX.Element {
	return (
		<section class="profile__card" id={id} aria-labelledby={`${id}-title`}>
			<h3 class="profile__card-title" id={`${id}-title`}>
				{title}
			</h3>
			{children}
		</section>
	);
}

function PasswordBlock(): JSX.Element {
	const noPassword = authUser.value?.hasPassword === false;
	const [open, setOpen] = useState(false);
	return (
		<section class="account-block" aria-labelledby="account-password">
			<h4 class="account-block__title" id="account-password">
				Password
			</h4>
			{open ? (
				<ChangePasswordForm setOnly={noPassword} onDone={() => setOpen(false)} />
			) : (
				<>
					<p class="account-text">{noPassword ? 'You sign in with a linked account. Set a password to sign in with your username too.' : 'Changing it signs out your other devices.'}</p>
					<div class="account-form__actions">
						<Button variant="secondary" size="sm" icon="edit" onClick={() => setOpen(true)}>
							{noPassword ? 'Set password' : 'Change password'}
						</Button>
					</div>
				</>
			)}
		</section>
	);
}

function Offline(): JSX.Element {
	return <p class="account-notice">Connect to the server to change this. Your data on this device is still here.</p>;
}

export default function Profile(): JSX.Element {
	const user = authUser.value;
	const signedIn = !!user && isLoggedIn.value;
	const online = serverConnector.status.value === 'online';

	// Read the account (email state, picture) from the server when the page opens.
	useEffect(() => {
		if (!signedIn || !online) return;
		void authActions
			.loadAccount()
			.then((u) => u && accountActions.cacheAvatar(u))
			.catch(() => undefined);
	}, [signedIn, online, user?.id]);

	if (!user || !signedIn) {
		return (
			<div class="profile">
				<header class="profile__head">
					<h2 class="profile__title">Profile</h2>
					<p class="profile__lead">Sign in or create an account to sync your games between devices. Without one, everything stays on this device.</p>
				</header>
				<Section id="sign-in" title="Sign in">
					<SignInPanel />
				</Section>
				<Section id="data" title="This device">
					<ExportData />
				</Section>
			</div>
		);
	}

	const owner = user.role === 'owner';
	const nav: NavItem[] = [
		{ id: 'profile', label: 'Profile' },
		{ id: 'security', label: 'Security' },
		{ id: 'invites', label: 'Invites' },
		{ id: 'data', label: 'Data' },
		...(owner ? [{ id: 'owner', label: 'Owner' }] : []),
	];
	const since = user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : null;

	return (
		<div class="profile">
			<header class="profile__head profile__who">
				<Avatar name={user.displayName || user.username} src={activeAvatarSrc()} size={56} />
				<div class="profile__who-text">
					<h2 class="profile__title">{user.displayName || user.username}</h2>
					<span class="profile__sub">
						@{user.username} <Badge tone={owner ? 'accent' : 'neutral'}>{ROLE_LABEL[user.role] ?? user.role}</Badge>
						{since && <span> · since {since}</span>}
					</span>
				</div>
				<Button variant="ghost" size="sm" onClick={() => void authActions.logout()}>
					Sign out
				</Button>
			</header>
			<SectionNav items={nav} />

			<Section id="profile" title="Profile">
				{online ? (
					<>
						<AvatarEditor />
						<DisplayNameForm />
						<AccountEmailForm />
					</>
				) : (
					<Offline />
				)}
			</Section>

			<Section id="security" title="Security">
				{online ? (
					<>
						<PasswordBlock />
						<RecoveryCodes />
						<DeviceSessions />
						<LinkedSignIns />
					</>
				) : (
					<Offline />
				)}
			</Section>

			<Section id="invites" title="Invites">
				{online ? <InviteFriend /> : <Offline />}
			</Section>

			<Section id="data" title="Data">
				<DataSection />
			</Section>

			{owner && (
				<Section id="owner" title="Owner tools">
					{online ? <OwnerTools /> : <Offline />}
				</Section>
			)}
		</div>
	);
}

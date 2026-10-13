// TopNav — logo · Current ▾ · Play · Openings · Games · Settings · offline · server status.
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { Icon } from '@/components/common/Icon';
import { IconButton } from '@/components/common/IconButton';
import { Tooltip } from '@/components/common/Tooltip';
import { SessionSwitcher } from '@/components/sessions/SessionSwitcher';
import { serverConnector } from '@/services/server';
import { useTheme } from '@/hooks/useTheme';
import { cx } from '@/lib/classNames';
import './TopNav.scss';

interface NavLink {
	href: string;
	label: string;
	match: (path: string) => boolean;
}

const LINKS: NavLink[] = [
	{ href: '/play', label: 'Play', match: (p) => p === '/play' || p.startsWith('/play/') },
	{ href: '/openings', label: 'Openings', match: (p) => p.startsWith('/openings') },
	{ href: '/games', label: 'Games', match: (p) => p.startsWith('/games') },
	{ href: '/settings/app', label: 'Settings', match: (p) => p.startsWith('/settings') },
];

const STATUS_TEXT = {
	online: 'Server connected',
	offline: 'Server unreachable — working offline',
	unconfigured: 'No server configured — working offline',
} as const;

export function ServerStatus(): JSX.Element {
	const status = serverConnector.status.value;
	const url = serverConnector.url.value;
	return (
		<Tooltip content={url && status !== 'unconfigured' ? `${STATUS_TEXT[status]} · ${url}` : STATUS_TEXT[status]} placement="bottom">
			<a href="/settings/server" class={cx('server-status', `server-status--${status}`)} aria-label={STATUS_TEXT[status]}>
				<span class="server-status__dot" />
				<span class="server-status__label">{status === 'online' ? 'Server' : 'Local'}</span>
			</a>
		</Tooltip>
	);
}

export function TopNav({ compact = false }: { compact?: boolean }): JSX.Element {
	const { path, route } = useLocation();
	const networkOnline = serverConnector.networkOnline.value;
	const theme = useTheme();
	return (
		<header class={cx('topnav', compact && 'topnav--compact')}>
			<a href="/" class="topnav__brand" aria-label="Chess Trainer — home">
				<span class="topnav__logo">
					<Icon name="logo" size={compact ? 22 : 24} />
				</span>
				{!compact && <span class="topnav__wordmark">Chess Trainer</span>}
			</a>
			<SessionSwitcher compact={compact} />
			{!compact && (
				<nav class="topnav__links" aria-label="Main">
					{LINKS.map((l) => (
						<a href={l.href} class={cx('topnav__link', l.match(path) && 'topnav__link--active')} aria-current={l.match(path) ? 'page' : undefined}>
							{l.label}
						</a>
					))}
				</nav>
			)}
			<div class="topnav__end">
				{!networkOnline && (
					<span class="topnav__offline" role="status">
						<Icon name="wifi-off" size={16} />
						{!compact && <span>Offline</span>}
					</span>
				)}
				<ServerStatus />
				<IconButton icon={theme.resolved === 'dark' ? 'sun' : 'moon'} label={theme.resolved === 'dark' ? 'Light theme' : 'Dark theme'} size="sm" onClick={theme.toggle} />
				{compact && <IconButton icon="play" label="Play" size="sm" onClick={() => route('/play')} />}
				{compact && <IconButton icon="settings" label="Settings" size="sm" onClick={() => route('/settings/app')} />}
			</div>
		</header>
	);
}

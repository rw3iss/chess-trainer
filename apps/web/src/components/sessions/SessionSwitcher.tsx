// "Current ▾ N" — quick switch between open sessions + link to /sessions.
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { getNode } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import { Menu, type MenuItem } from '@/components/common/Menu';
import { Icon } from '@/components/common/Icon';
import { activeId, activeSession, openSessions, sessionCount, sessionsActions } from '@/state/sessions';
import { commands } from '@/services/commands';
import { describeMove } from '@/lib/format';
import { cx } from '@/lib/classNames';
import './SessionSwitcher.scss';

const QUICK_LIST_MAX = 8;

export function lastMoveLabel(s: Session): string {
	const n = getNode(s.tree, s.cursor);
	return n.ply === 0 ? 'Start' : describeMove(n.ply, n.san);
}

export function SessionSwitcher({ compact = false }: { compact?: boolean }): JSX.Element {
	const { route } = useLocation();
	const list = openSessions.value;
	const current = activeSession.value;
	const count = sessionCount.value;
	const quick = list.slice(-QUICK_LIST_MAX).reverse();

	const items: MenuItem[] = [
		{ heading: count ? `Open sessions · ${count}` : 'No open sessions' },
		...quick.map<MenuItem>((s) => ({
			id: s.id,
			label: `${s.title} — ${lastMoveLabel(s)}`,
			icon: s.mode === 'bot' ? 'bot' : 'board',
			checked: s.id === activeId.value,
			onSelect: () => {
				sessionsActions.setActive(s.id);
				route('/');
			},
		})),
		{ separator: true },
		{
			id: 'new',
			label: 'New game',
			icon: 'plus',
			onSelect: () => {
				route('/');
				commands.dispatch('newGame');
			},
		},
		{ id: 'all', label: 'All sessions', icon: 'grid', shortcut: count > QUICK_LIST_MAX ? `+${count - QUICK_LIST_MAX}` : undefined, onSelect: () => route('/sessions') },
	];

	return (
		<Menu
			items={items}
			align="start"
			minWidth={300}
			ariaLabel="Open sessions"
			trigger={(p) => (
				<button {...p} type="button" class={cx('session-switcher', compact && 'session-switcher--compact')}>
					<span class="session-switcher__label">
						<span class="session-switcher__eyebrow">Current</span>
						<span class="session-switcher__title">
							{current?.title ?? 'No game open'}
							{current?.dirty && current.savedGameId && (
								<span class="session-switcher__dirty" title="Unsaved changes" aria-label="(unsaved changes)">
									•
								</span>
							)}
						</span>
					</span>
					<span class="session-switcher__count" aria-label={`${count} open`}>
						{count}
					</span>
					<Icon name="chevron-down" size={16} class="session-switcher__chevron" />
				</button>
			)}
		/>
	);
}

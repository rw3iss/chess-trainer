// SessionCard — mini board, title, mode, last move, updated time, close.
import type { JSX } from 'preact';
import type { Session } from '@chess/core/game';
import { StageMiniBoard } from '@/components/stage/BoardStage';
import { Badge } from '@/components/common/Badge';
import { IconButton } from '@/components/common/IconButton';
import { formatRelativeTime } from '@/lib/format';
import { cx } from '@/lib/classNames';
import { lastMoveLabel } from './SessionSwitcher';
import './SessionCard.scss';

const MODE_LABEL: Record<Session['mode'], string> = { analysis: 'Analysis', bot: 'vs Bot', 'local-pvp': 'Local', online: 'Online' };

export interface SessionCardProps {
	session: Session;
	active: boolean;
	playing?: boolean;
	onOpen: () => void;
	onClose: () => void;
}

export function SessionCard({ session, active, playing, onOpen, onClose }: SessionCardProps): JSX.Element {
	return (
		<article class={cx('session-card', active && 'session-card--active')}>
			<button type="button" class="session-card__open" onClick={onOpen} aria-label={`Open ${session.title}`}>
				<span class="session-card__board">
					<StageMiniBoard session={session} />
				</span>
				<span class="session-card__body">
					<span class="session-card__title">{session.title}</span>
					<span class="session-card__meta">
						<Badge tone={session.mode === 'analysis' ? 'neutral' : 'accent'}>{MODE_LABEL[session.mode]}</Badge>
						{active && <Badge tone="success">Active</Badge>}
						{playing && <Badge tone="info">Playing</Badge>}
						{session.savedGameId && !session.dirty && <Badge tone="neutral">Saved</Badge>}
					</span>
					<span class="session-card__foot">
						<span class="session-card__move">{lastMoveLabel(session)}</span>
						<span class="session-card__time">{formatRelativeTime(session.updatedAt)}</span>
					</span>
				</span>
			</button>
			<IconButton icon="close" label={`Close ${session.title}`} size="sm" class="session-card__close" onClick={onClose} />
		</article>
	);
}

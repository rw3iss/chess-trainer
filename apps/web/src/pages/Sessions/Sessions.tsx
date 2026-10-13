// /sessions — every open session as a card (mini board, title, mode, last move, close).
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { SessionCard } from '@/components/sessions/SessionCard';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';
import { activeId, openSessions, sessionsActions } from '@/state/sessions';
import { playback } from '@/state/playback';
import { commands } from '@/services/commands';
import './Sessions.scss';

export default function Sessions(): JSX.Element {
	const { route } = useLocation();
	const list = openSessions.value;
	const playing = playback.playing.value;

	const openSession = (id: string) => {
		sessionsActions.setActive(id);
		route('/');
	};

	return (
		<div class="sessions-page">
			<header class="sessions-page__head">
				<div>
					<h1 class="sessions-page__title">Open sessions</h1>
					<p class="sessions-page__sub">
						{list.length ? `${list.length} open · autosaved on this device` : 'Sessions stay open across reloads until you close them.'}
					</p>
				</div>
				<Button
					variant="primary"
					icon="plus"
					onClick={() => {
						route('/');
						commands.dispatch('newGame');
					}}
				>
					New game
				</Button>
			</header>
			{list.length === 0 ? (
				<EmptyState icon="sessions" title="No open sessions" description="Start a new game or load an opening — it will appear here.">
					<Button variant="secondary" icon="book" onClick={() => route('/openings')}>
						Browse openings
					</Button>
				</EmptyState>
			) : (
				<div class="sessions-page__grid">
					{[...list].reverse().map((s) => (
						<SessionCard
							key={s.id}
							session={s}
							active={s.id === activeId.value}
							playing={playing.has(s.id)}
							onOpen={() => openSession(s.id)}
							onClose={() => sessionsActions.close(s.id)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

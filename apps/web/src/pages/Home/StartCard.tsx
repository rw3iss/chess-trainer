// Start card — shown on '/' when no session is open: New game · Browse openings · Resume.
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { Button } from '@/components/common/Button';
import { Icon } from '@/components/common/Icon';
import { savedGames } from '@/state/savedGames';
import { sessionsActions } from '@/state/sessions';
import { formatRelativeTime } from '@/lib/format';

const RESUME_MAX = 4;

export function StartCard(): JSX.Element {
	const { route } = useLocation();
	const recent = savedGames.value.slice(0, RESUME_MAX);
	return (
		<div class="start-card">
			<div class="start-card__hero">
				<span class="start-card__mark">
					<Icon name="logo" size={36} />
				</span>
				<h1 class="start-card__title">Your study, ready.</h1>
				<p class="start-card__lead">Load an opening and play it through, analyse your own line, or practise against a bot from any position.</p>
			</div>
			<div class="start-card__actions">
				<Button variant="primary" size="lg" icon="plus" block onClick={() => sessionsActions.newSession()}>
					New game
				</Button>
				<Button variant="secondary" size="lg" icon="book" block onClick={() => route('/openings')}>
					Browse openings
				</Button>
			</div>
			{recent.length > 0 && (
				<div class="start-card__resume">
					<h2 class="start-card__eyebrow">Resume a saved game</h2>
					<ul class="start-card__list" role="list">
						{recent.map((g) => (
							<li>
								<button type="button" class="start-card__game" onClick={() => sessionsActions.fromSavedGame(g)}>
									<Icon name="games" size={16} />
									<span class="start-card__game-name">{g.name}</span>
									<span class="start-card__game-time">{formatRelativeTime(g.updatedAt)}</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			)}
			<p class="start-card__tip">
				Tip: just make a move on the board to start analysing. <kbd>←</kbd> <kbd>→</kbd> step, <kbd>Space</kbd> plays.
			</p>
		</div>
	);
}

// '/' — Moves panel for the active session, or the Start card.
import type { JSX } from 'preact';
import { MovesPanel } from '@/components/moves';
import { activeSession, sessionsRestored } from '@/state/sessions';
import { Spinner } from '@/components/common/Spinner';
import { StartCard } from './StartCard';
import './Home.scss';

export default function Home(): JSX.Element {
	const session = activeSession.value;
	if (!sessionsRestored.value) {
		return (
			<div class="home home--loading">
				<Spinner label="Restoring sessions" />
			</div>
		);
	}
	return <div class="home">{session ? <MovesPanel session={session} /> : <StartCard />}</div>;
}

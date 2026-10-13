// Floating "now playing" chip shown over mobile sheets — returns to the game.
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { StageMiniBoard } from '@/components/stage/BoardStage';
import { lastMoveLabel } from '@/components/sessions/SessionSwitcher';
import { activeSession } from '@/state/sessions';
import { activeIsPlaying } from '@/state/playback';
import { Icon } from '@/components/common/Icon';
import './NowPlayingChip.scss';

export function NowPlayingChip(): JSX.Element | null {
	const { route } = useLocation();
	const s = activeSession.value;
	if (!s) return null;
	return (
		<button type="button" class="now-playing" onClick={() => route('/')} aria-label={`Back to game: ${s.title}`}>
			<span class="now-playing__board">
				<StageMiniBoard session={s} size={44} />
			</span>
			<span class="now-playing__text">
				<span class="now-playing__eyebrow">
					{activeIsPlaying.value && <Icon name="play" size={10} />}
					Now playing
				</span>
				<span class="now-playing__title">{s.title}</span>
				<span class="now-playing__move">{lastMoveLabel(s)}</span>
			</span>
		</button>
	);
}

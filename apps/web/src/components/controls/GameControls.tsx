// GameControls — always acts on the ACTIVE session (PLAN §4.1).
// first / prev / play-pause (+ speed) / next / last · flip · fork · save · bot · more.
import type { JSX } from 'preact';
import { activeResult, type PlaybackSpeed } from '@chess/core/game';
import { IconButton } from '@/components/common/IconButton';
import { Menu, type MenuItem } from '@/components/common/Menu';
import { commands } from '@/services/commands';
import { activeSession, isAtLineEnd, isAtStart, sessionsActions } from '@/state/sessions';
import { activeIsPlaying, playbackActions } from '@/state/playback';
import { settings } from '@/state/settings';
import { cx } from '@/lib/classNames';
import { copyFen, copyPgn } from './sessionCommands';
import './GameControls.scss';

const SPEEDS: { value: PlaybackSpeed; label: string }[] = [
	{ value: 'slow', label: 'Slow' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'fast', label: 'Fast' },
];

const SPEED_SHORT: Record<PlaybackSpeed, string> = { slow: '½×', medium: '1×', fast: '2×' };

export function GameControls({ class: className }: { class?: string }): JSX.Element {
	const session = activeSession.value;
	const playing = activeIsPlaying.value;
	const has = !!session;
	const atStart = !session || isAtStart(session);
	const atEnd = !session || isAtLineEnd(session);
	const speed = session?.playback.speed ?? settings.value.defaultPlaybackSpeed;
	const ms = settings.value.playback;

	const speedItems: MenuItem[] = [
		{ heading: 'Playback speed' },
		...SPEEDS.map((s) => ({
			id: s.value,
			label: `${s.label} · ${(ms[s.value] / 1000).toFixed(1)} s`,
			checked: s.value === speed,
			onSelect: () => playbackActions.setSpeed(s.value),
		})),
	];

	const moreItems: MenuItem[] = [
		{ id: 'new', label: 'New game', icon: 'plus', onSelect: () => commands.dispatch('newGame') },
		{ id: 'flip', label: 'Flip board', icon: 'flip', shortcut: 'F', disabled: !has, onSelect: () => sessionsActions.flip() },
		{ id: 'fork', label: 'Fork from here', icon: 'fork', disabled: !has, onSelect: () => commands.dispatch('fork') },
		{ id: 'bot', label: 'Play vs bot…', icon: 'bot', disabled: !has, onSelect: () => commands.dispatch('openBot') },
		{ id: 'save-as', label: 'Save as…', icon: 'save', shortcut: 'Ctrl ⇧ S', disabled: !has, onSelect: () => commands.dispatch('saveAs') },
		...(session?.mode === 'local-pvp' && !activeResult(session)
			? [
					{ separator: true },
					{ id: 'draw', label: 'Offer draw…', icon: 'minus', onSelect: () => commands.dispatch('offerDraw') },
					{ id: 'resign', label: 'Resign…', icon: 'warning', danger: true, onSelect: () => commands.dispatch('resign') },
				] satisfies MenuItem[]
			: []),
		{ separator: true },
		{ id: 'pgn', label: 'Copy PGN', icon: 'copy', disabled: !has, onSelect: copyPgn },
		{ id: 'fen', label: 'Copy FEN', icon: 'copy', disabled: !has, onSelect: copyFen },
		{ separator: true },
		{ id: 'close', label: 'Close session', icon: 'close', danger: true, disabled: !has, onSelect: () => sessionsActions.close() },
	];

	return (
		<div class={cx('game-controls', className)} role="toolbar" aria-label="Game controls">
			<div class="game-controls__group game-controls__nav">
				<IconButton icon="first" label="Start (Home)" disabled={atStart} onClick={() => sessionsActions.toStart()} />
				<IconButton icon="step-back" label="Previous (←)" disabled={atStart} onClick={() => sessionsActions.step(-1)} />
				<IconButton
					icon={playing ? 'pause' : 'play'}
					label={playing ? 'Pause (Space)' : 'Play (Space)'}
					variant="accent"
					size="lg"
					class="game-controls__play"
					disabled={!has || (session && !playing && atEnd && atStart)}
					active={playing}
					onClick={() => playbackActions.toggle()}
				/>
				<IconButton icon="step-forward" label="Next (→)" disabled={atEnd} onClick={() => sessionsActions.step(1)} />
				<IconButton icon="last" label="End (End)" disabled={atEnd} onClick={() => sessionsActions.toEnd()} />
				<Menu
					items={speedItems}
					align="start"
					placement="top"
					minWidth={190}
					trigger={(p) => (
						<button {...p} type="button" class="game-controls__speed" disabled={!has} title="Playback speed" aria-label={`Playback speed: ${speed}`}>
							{SPEED_SHORT[speed]}
						</button>
					)}
				/>
			</div>
			<div class="game-controls__group game-controls__actions">
				<IconButton icon="flip" label="Flip board (F)" class="game-controls__opt game-controls__opt--flip" disabled={!has} onClick={() => sessionsActions.flip()} />
				<IconButton icon="fork" label="Fork from here" class="game-controls__opt game-controls__opt--fork" disabled={!has} onClick={() => commands.dispatch('fork')} />
				<IconButton icon="save" label={session?.savedGameId ? 'Save (Ctrl S)' : 'Save… (Ctrl S)'} disabled={!has} badge={session?.dirty && session.savedGameId ? '•' : undefined} onClick={() => commands.dispatch('save')} />
				<IconButton icon="bot" label="Play vs bot" class="game-controls__opt game-controls__opt--bot" disabled={!has} active={session?.mode === 'bot'} onClick={() => commands.dispatch('openBot')} />
				<Menu items={moreItems} align="end" placement="top" trigger={(p) => <IconButton {...p} icon="more" label="More" />} />
			</div>
		</div>
	);
}

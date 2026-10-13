// '/play' — quick play: jump into a bot or local 2-player game. The board on the left plays the
// game; this panel shows the current game (status, opening, moves) with a "New game" setup.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { activeResult, type Session } from '@chess/core/game';
import { turnFromFen } from '@chess/core/chess';
import { Button, Badge, SegmentedControl } from '@/components/common';
import { MovesPanel } from '@/components/moves';
import { BotStatusCard } from '@/components/engine';
import { BotSetupFields, toSetup, useBotSetupForm } from '@/components/controls/BotModal';
import {
	PvpSetupFields,
	StartPositionField,
	buildNewGamePlan,
	initialNewGameForm,
	startFen,
	startNewGame,
	validateNewGame,
	type NewGameForm,
} from '@/components/controls/NewGameModal';
import { commands } from '@/services/commands';
import { activeSession, openSessions, sessionsActions } from '@/state/sessions';
import { botActions, isBotThinking } from '@/state/engines';
import { settings } from '@/state/settings';
import { formatRelativeTime } from '@/lib/format';
import { useUIState } from '@/hooks/useUIState';
import './QuickPlay.scss';

type Opponent = 'bot' | 'local';

const OPPONENTS: { value: Opponent; label: string; icon: 'bot' | 'user' }[] = [
	{ value: 'bot', label: 'Bot', icon: 'bot' },
	{ value: 'local', label: '2 players', icon: 'user' },
];

/** A game you play (not analysis / online). */
export function isPlayableGame(s: Session | null | undefined): s is Session {
	return !!s && (s.mode === 'bot' || s.mode === 'local-pvp');
}

/** Scroll the nearest scrolling ancestor so `el` sits at its top (no page jump, unlike scrollIntoView). */
function scrollPanelTo(el: HTMLElement | null): void {
	let box = el?.parentElement ?? null;
	while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;
	if (!el || !box) return;
	box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top;
}

function resultText(s: Session): string | null {
	const r = activeResult(s);
	if (!r) return null;
	const who = r.winner ? `${r.winner === 'white' ? 'White' : 'Black'} wins` : 'Draw';
	return `${who} by ${r.reason.replace('-', ' ')}`;
}

function statusText(s: Session): string {
	const done = resultText(s);
	if (done) return done;
	const fen = s.tree.nodes[s.cursor]?.fen ?? '';
	const turn = turnFromFen(fen);
	if (s.mode === 'bot' && s.bot) {
		if (turn === s.bot.color) return isBotThinking(s.id) ? 'Bot is thinking…' : 'Bot to move';
		return 'Your move';
	}
	return `${turn === 'white' ? 'White' : 'Black'} to move`;
}

function CurrentGame({ session }: { session: Session }): JSX.Element {
	const over = !!activeResult(session);
	return (
		<div class="quick-play__game">
			{/* Bot games: the bot card shows whose move it is; others get a status row. A result always shows here. */}
			{(session.mode !== 'bot' || over) && (
				<div class="quick-play__status" role="status">
					<Badge tone={over ? 'neutral' : 'accent'}>{session.mode === 'bot' ? 'vs Bot' : '2 players'}</Badge>
					<span class="quick-play__status-text">{statusText(session)}</span>
					{over && (
						<span class="quick-play__status-hint">Step back to continue from an earlier move.</span>
					)}
				</div>
			)}
			{session.mode === 'bot' && <BotStatusCard session={session} />}
			{session.mode === 'local-pvp' && !over && (
				<div class="quick-play__actions">
					<Button variant="secondary" size="sm" icon="flip" onClick={() => sessionsActions.flip()}>
						Flip
					</Button>
					<Button variant="secondary" size="sm" icon="minus" onClick={() => commands.dispatch('offerDraw')}>
						Offer draw
					</Button>
					<Button variant="ghost" size="sm" icon="warning" onClick={() => commands.dispatch('resign')}>
						Resign
					</Button>
				</div>
			)}
			<MovesPanel session={session} />
		</div>
	);
}

interface SetupProps {
	onStarted: () => void;
	onCancel?: () => void;
}

function NewGameSetup({ onStarted, onCancel }: SetupProps): JSX.Element {
	const { route } = useLocation();
	const current = activeSession.value;
	const currentFen = current ? (current.tree.nodes[current.cursor]?.fen ?? null) : null;
	const [opponent, setOpponent] = useUIState<Opponent>('play:opponent', 'bot');
	const [form, setForm] = useState<NewGameForm>(() => initialNewGameForm(settings.value.clock, 'local-pvp'));
	const [touched, setTouched] = useState(false);
	const bot = useBotSetupForm(null, true, 'play');
	const set = (patch: Partial<NewGameForm>) => setForm((f) => ({ ...f, ...patch }));
	const error = validateNewGame(form, currentFen);
	const canStart = !error && (opponent === 'local' || bot.canStart);

	const start = () => {
		setTouched(true);
		if (!canStart) return;
		if (opponent === 'local') {
			startNewGame(buildNewGamePlan({ ...form, mode: 'local-pvp' }, currentFen));
		} else {
			const fen = startFen(form, currentFen);
			const created = sessionsActions.newSession({ mode: 'analysis', fen, source: { kind: 'new' } });
			botActions.attach(toSetup(bot.form), created.id);
		}
		onStarted();
	};

	return (
		<form
			class="quick-play__setup"
			onSubmit={(e) => {
				e.preventDefault();
				start();
			}}
		>
			<div class="new-game__field">
				<span class="new-game__label">Opponent</span>
				<SegmentedControl options={OPPONENTS} value={opponent} onChange={setOpponent} ariaLabel="Opponent" />
				<button type="button" class="quick-play__online" onClick={() => route('/play/new')}>
					Or play online with a friend →
				</button>
			</div>

			<StartPositionField form={form} set={set} hasCurrent={!!currentFen} error={touched || form.fen.trim() ? (error ?? undefined) : undefined} />

			{opponent === 'bot' ? <BotSetupFields form={bot.form} set={bot.set} /> : <PvpSetupFields form={form} set={set} />}

			<div class="quick-play__start">
				{onCancel && (
					<Button variant="ghost" onClick={onCancel}>
						Back to game
					</Button>
				)}
				<Button variant="primary" size="lg" icon="play" type="submit" disabled={touched && !canStart} class="quick-play__start-btn">
					Start game
				</Button>
			</div>
		</form>
	);
}

function ResumeList({ games }: { games: Session[] }): JSX.Element | null {
	if (!games.length) return null;
	return (
		<div class="quick-play__resume">
			<h2 class="quick-play__eyebrow">Resume</h2>
			<ul role="list">
				{games.map((g) => (
					<li key={g.id}>
						<button type="button" class="quick-play__resume-item" onClick={() => sessionsActions.setActive(g.id)}>
							<span class="quick-play__resume-title">{g.title}</span>
							<span class="quick-play__resume-time">{formatRelativeTime(g.updatedAt)}</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

export default function QuickPlay(): JSX.Element {
	const session = activeSession.value;
	const playing = isPlayableGame(session);
	const [setup, setSetup] = useState(!playing);
	// Switching to a game (e.g. from the session switcher) shows it; no game shows the setup.
	useEffect(() => {
		setSetup(!playing);
	}, [session?.id, playing]);
	// Setup ⇄ game swap: start the panel at the top (the setup form is long on phones).
	const root = useRef<HTMLDivElement>(null);
	useEffect(() => scrollPanelTo(root.current), [setup]);

	const others = openSessions.value.filter((s) => s.id !== session?.id && isPlayableGame(s) && !activeResult(s)).slice(0, 4);

	return (
		<div class="quick-play" ref={root}>
			<header class="quick-play__head">
				<h1 class="quick-play__title">{setup || !playing ? 'New game' : 'Playing'}</h1>
				{playing && !setup && (
					<Button variant="primary" size="sm" icon="plus" onClick={() => setSetup(true)}>
						New game
					</Button>
				)}
			</header>
			{setup || !playing ? (
				<>
					<NewGameSetup onStarted={() => setSetup(false)} onCancel={playing ? () => setSetup(false) : undefined} />
					<ResumeList games={others} />
				</>
			) : (
				<CurrentGame session={session} />
			)}
		</div>
	);
}

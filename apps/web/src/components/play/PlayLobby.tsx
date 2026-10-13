// PlayLobby — "Play online": create a room (time control, colour, name) or join by link/code.
// Shows an explanation instead when the server (or its rooms feature) is unavailable.
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { CLOCK_PRESETS } from '@chess/core/clock';
import type { Color } from '@chess/core/chess';
import { Button, EmptyState, Input, SegmentedControl, Select, type SelectOption } from '@/components/common';
import { parseRoomRef } from '@/services/realtime';
import { authActions, displayName, guestName, isLoggedIn } from '@/state/auth';
import { roomError, roomJoining, roomsActions, roomsAvailable, roomsUnavailableReason } from '@/state/rooms';
import './PlayLobby.scss';

type ColorChoice = Color | 'random';
const UNTIMED = 'none';

const TIME_OPTIONS: SelectOption<string>[] = [
	...CLOCK_PRESETS.map((p) => ({ value: p.id, label: `${p.label}  ·  ${p.config.initialMs / 60_000} min + ${p.config.incrementMs / 1000} s` })),
	{ value: UNTIMED, label: 'Untimed' },
];

export function PlayUnavailable(): JSX.Element {
	const { route } = useLocation();
	return (
		<EmptyState icon="wifi-off" title="Online play is unavailable" description={roomsUnavailableReason.value ?? 'Connecting to the server…'}>
			<Button variant="secondary" icon="server" onClick={() => route('/settings/server')}>
				Server settings
			</Button>
		</EmptyState>
	);
}

/** Guest display name (only when not signed in). */
export function GuestNameField(): JSX.Element | null {
	const [value, setValue] = useState(guestName.value);
	if (isLoggedIn.value) return null;
	return (
		<Input
			label="Your name"
			hint="Shown to your opponent. Sign in under Settings → Server to use your account."
			value={value}
			maxLength={40}
			placeholder="Guest"
			onInput={(e) => setValue(e.currentTarget.value)}
			onBlur={() => void authActions.setGuestName(value)}
		/>
	);
}

export function PlayLobby(): JSX.Element {
	const { route } = useLocation();
	const [time, setTime] = useState<string>('5+3');
	const [color, setColor] = useState<ColorChoice>('random');
	const [name, setName] = useState('');
	const [joinRef, setJoinRef] = useState('');
	const [joinError, setJoinError] = useState<string | null>(null);

	if (!roomsAvailable.value) {
		return (
			<div class="play-lobby">
				<header class="play-lobby__header">
					<h1 class="play-lobby__title">Play online</h1>
				</header>
				<PlayUnavailable />
			</div>
		);
	}

	const create = async (e: Event) => {
		e.preventDefault();
		const preset = CLOCK_PRESETS.find((p) => p.id === time);
		try {
			const room = await roomsActions.create({ name, color, clock: preset?.config });
			route(`/play/${room.id}`);
		} catch {
			/* roomError shows it */
		}
	};

	const join = (e: Event) => {
		e.preventDefault();
		const id = parseRoomRef(joinRef);
		if (!id) {
			setJoinError('Paste a room link (…/play/abc123) or a room code.');
			return;
		}
		setJoinError(null);
		route(`/play/${id}`);
	};

	return (
		<div class="play-lobby">
			<header class="play-lobby__header">
				<span class="play-lobby__eyebrow">Online</span>
				<h1 class="play-lobby__title">Play a friend</h1>
				<p class="play-lobby__lead">Create a room and send the link — or paste a link you were given.</p>
			</header>

			<form class="play-lobby__card" onSubmit={create}>
				<h2 class="play-lobby__card-title">New room</h2>
				<Select label="Time control" value={time} options={TIME_OPTIONS} onChange={setTime} />
				<div class="play-lobby__field">
					<span class="play-lobby__label" id="play-color-label">
						You play
					</span>
					<SegmentedControl<ColorChoice>
						ariaLabel="Your colour"
						value={color}
						onChange={setColor}
						options={[
							{ value: 'white', label: 'White' },
							{ value: 'random', label: 'Random' },
							{ value: 'black', label: 'Black' },
						]}
					/>
				</div>
				<Input label="Room name" placeholder={`${displayName.value}'s game`} value={name} maxLength={64} onInput={(e) => setName(e.currentTarget.value)} />
				<GuestNameField />
				{roomError.value && (
					<p class="play-lobby__error" role="alert">
						{roomError.value}
					</p>
				)}
				<Button variant="primary" size="lg" icon="plus" block type="submit" loading={roomJoining.value}>
					Create room
				</Button>
			</form>

			<form class="play-lobby__card" onSubmit={join}>
				<h2 class="play-lobby__card-title">Join a room</h2>
				<Input
					label="Room link or code"
					placeholder="https://…/play/abc123"
					value={joinRef}
					error={joinError ?? undefined}
					onInput={(e) => setJoinRef(e.currentTarget.value)}
				/>
				<Button variant="secondary" block type="submit" disabled={!joinRef.trim()}>
					Join
				</Button>
			</form>
		</div>
	);
}

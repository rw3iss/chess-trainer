// OnlineClock — read-only display of a (server-authoritative) ClockState for one side.
// Ticks locally with requestAnimationFrame-free 100 ms intervals while that side runs.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { Color } from '@chess/core/chess';
import { formatClock, remainingAt, type ClockState } from '@chess/core/clock';
import { cx } from '@/lib/classNames';
import './OnlineClock.scss';

export interface OnlineClockProps {
	clock: ClockState;
	color: Color;
	size?: 'sm' | 'md';
	/** Low-time threshold (ms) for the warning style. */
	lowMs?: number;
	class?: string;
}

const TICK_MS = 100;

export function OnlineClock({ clock, color, size = 'md', lowMs = 20_000, class: className }: OnlineClockProps): JSX.Element {
	const running = clock.running === color && !clock.flagged;
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!running) return;
		setNow(Date.now());
		const t = setInterval(() => setNow(Date.now()), TICK_MS);
		return () => clearInterval(t);
	}, [running, clock]);
	const ms = remainingAt(clock, color, running ? now : Date.now());
	const flagged = clock.flagged === color;
	return (
		<span
			class={cx('online-clock', `online-clock--${size}`, running && 'online-clock--running', ms < lowMs && 'online-clock--low', flagged && 'online-clock--flagged', className)}
			role="timer"
			aria-label={`${color} clock ${formatClock(ms)}`}
		>
			{flagged ? '0:00' : formatClock(ms)}
		</span>
	);
}

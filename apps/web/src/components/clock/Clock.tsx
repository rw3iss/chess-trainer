// Clock — one side's chess clock for a session. Reads the live time from the
// ClockController, formats with core formatClock (tenths under 10 s when
// enabled), pulses under the low-time threshold, shows the running dot and the
// flag. Tapping a paused clock resumes it; tapping the running one pauses.
import type { JSX } from 'preact';
import type { Color } from '@chess/core/chess';
import { formatClock, remainingAt } from '@chess/core/clock';
import type { Session } from '@chess/core/game';
import { Icon } from '@/components/common/Icon';
import { settings } from '@/state/settings';
import { cx } from '@/lib/classNames';
import { clockController } from './clockService';
import './Clock.scss';

const TENTHS_UNDER_MS = 10_000;

export interface ClockProps {
	session: Session;
	color: Color;
	/** Visual variant: inline in a player strip, a vertical side tile, or a floating overlay chip. */
	variant?: 'strip' | 'side' | 'overlay';
	/** Rotate 180° (tabletop mode, top clock). */
	rotated?: boolean;
	class?: string;
}

export function Clock({ session, color, variant = 'strip', rotated, class: className }: ClockProps): JSX.Element | null {
	const clock = session.clock;
	const now = clockController.now.value;
	const cs = settings.value.clock;
	if (!clock) return null;
	const ms = remainingAt(clock, color, now);
	const running = clock.running === color;
	const flagged = clock.flagged === color;
	const low = !flagged && cs.lowTimeMs > 0 && ms < cs.lowTimeMs && clock.config.initialMs > cs.lowTimeMs;
	const paused = clockController.isPaused(session) && clock.toMove === color;
	const text = formatClock(ms, { tenthsUnderMs: cs.tenths ? TENTHS_UNDER_MS : 0 });
	const name = color === 'white' ? 'White' : 'Black';
	const live = session.mode !== 'online' && !session.result && !clock.flagged;

	const onClick = () => {
		if (!live) return;
		if (running) clockController.pause(session.id);
		else if (paused) clockController.resume(session.id);
	};
	const state = flagged ? 'flagged' : running ? 'running' : paused ? 'paused' : 'idle';

	return (
		<button
			type="button"
			class={cx(
				'clock',
				`clock--${variant}`,
				`clock--${cs.size.toLowerCase()}`,
				`clock--${color}`,
				running && 'clock--running',
				low && 'clock--low',
				flagged && 'clock--flagged',
				paused && 'clock--paused',
				rotated && 'clock--rotated',
				className,
			)}
			data-state={state}
			aria-label={`${name} clock ${text}${flagged ? ', flagged' : running ? ', running' : paused ? ', paused — tap to resume' : ''}`}
			title={running ? 'Pause clock' : paused ? 'Resume clock' : undefined}
			disabled={!live || (!running && !paused)}
			onClick={onClick}
		>
			<span class="clock__indicator" aria-hidden="true">
				{flagged ? <Icon name="warning" size={14} /> : paused ? <Icon name="pause" size={12} /> : <span class="clock__dot" />}
			</span>
			<span class="clock__time">{text}</span>
		</button>
	);
}

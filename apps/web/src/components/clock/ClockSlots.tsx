// Stage-slot adapters: render clocks where settings.clock.placement says.
//   top-bottom → inside the player strips (clockTop / clockBottom)
//   side       → vertical pair beside the board (side)
//   overlay    → floating chips over the board corners (overlay)
// Tabletop (session.pvp.tabletop) rotates the top clock 180°.
import type { JSX } from 'preact';
import type { Color } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import { stageSlots, type StageSideSlotProps, type StageSlotProps } from '@/components/stage/slots';
import { settings } from '@/state/settings';
import { Clock } from './Clock';

const opposite = (c: Color): Color => (c === 'white' ? 'black' : 'white');

function sides(session: Session): { top: Color; bottom: Color } {
	return { top: opposite(session.orientation), bottom: session.orientation };
}

function placed(session: Session, placement: 'side' | 'top-bottom' | 'overlay'): boolean {
	return !!session.clock && settings.value.clock.placement === placement;
}

export function StripClockTop({ session, color }: StageSlotProps): JSX.Element | null {
	if (!placed(session, 'top-bottom')) return null;
	return <Clock session={session} color={color} variant="strip" rotated={!!session.pvp?.tabletop} />;
}

export function StripClockBottom({ session, color }: StageSlotProps): JSX.Element | null {
	if (!placed(session, 'top-bottom')) return null;
	return <Clock session={session} color={color} variant="strip" />;
}

export function SideClocks({ session }: StageSideSlotProps): JSX.Element | null {
	if (!placed(session, 'side')) return null;
	const { top, bottom } = sides(session);
	return (
		<div class="clock-side" aria-label="Clocks">
			<Clock session={session} color={top} variant="side" rotated={!!session.pvp?.tabletop} />
			<Clock session={session} color={bottom} variant="side" />
		</div>
	);
}

export function OverlayClocks({ session }: StageSideSlotProps): JSX.Element | null {
	if (!placed(session, 'overlay')) return null;
	const { top, bottom } = sides(session);
	return (
		<div class="clock-overlay" aria-label="Clocks">
			<Clock session={session} color={top} variant="overlay" class="clock-overlay__top" rotated={!!session.pvp?.tabletop} />
			<Clock session={session} color={bottom} variant="overlay" class="clock-overlay__bottom" />
		</div>
	);
}

/** Register every placement's slot component; returns unregister. */
export function registerClockSlots(): () => void {
	const offs = [
		stageSlots.clockTop.register(StripClockTop),
		stageSlots.clockBottom.register(StripClockBottom),
		stageSlots.side.register(SideClocks),
		stageSlots.overlay.register(OverlayClocks),
	];
	return () => offs.forEach((off) => off());
}

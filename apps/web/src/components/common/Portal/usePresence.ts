// Keeps an overlay mounted through its exit animation.
// state: 'open' while shown, 'closed' during the exit animation; mounted=false after.

import { useEffect, useState } from 'preact/hooks';

export type PresenceState = 'open' | 'closed';

export function usePresence(open: boolean, exitMs = 200): { mounted: boolean; state: PresenceState } {
	const [mounted, setMounted] = useState(open);
	useEffect(() => {
		if (open) {
			setMounted(true);
			return;
		}
		const t = setTimeout(() => setMounted(false), exitMs);
		return () => clearTimeout(t);
	}, [open, exitMs]);
	return { mounted: open || mounted, state: open ? 'open' : 'closed' };
}

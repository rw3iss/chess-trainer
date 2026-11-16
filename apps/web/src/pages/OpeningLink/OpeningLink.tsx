// /openings/:slug — deep link to an opening (slug or id) or a shared line (~code), shown on the board
// with the Moves panel. Loads it once per address (not again while the user plays on from it);
// an unknown slug or a bad code goes to the openings list with a message.
import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { useRoute } from 'preact-iso';
import { lineEnd, treeFromUci } from '@chess/core/chess';
import { MovesPanel } from '@/components/moves';
import { Spinner } from '@/components/common/Spinner';
import { loadOpening } from '@/components/openings';
import { activeId, activeSession, sessionsActions, sessionsRestored } from '@/state/sessions';
import { loadOpenings, openingIndex, openingsStatus } from '@/state/openings';
import { navigate } from '@/lib/navigate';
import { pathForSession, resolveLink, sessionLine } from '@/lib/openingLinks';
import '@/pages/Home/Home.scss';

export default function OpeningLink(): JSX.Element {
	const { params } = useRoute();
	const param = params.slug ?? '';
	const index = openingIndex.value;
	const restored = sessionsRestored.value;
	/** Session this address was resolved to. */
	const linked = useRef<string | null>(null);

	useEffect(() => {
		if (openingsStatus.value === 'idle') void loadOpenings();
	}, []);

	// Resolve the address once the dataset and the saved sessions are ready.
	useEffect(() => {
		if (!index || !restored) return;
		const link = resolveLink(index, param);
		const active = activeSession.value;
		if (link.kind === 'invalid' || link.kind === 'not-found') {
			navigate(`/openings?missing=${encodeURIComponent(param)}`, { replace: true });
			return;
		}
		if (link.kind === 'opening') {
			// Already on it (e.g. we just loaded it, or the user plays on from it): keep the session.
			if (active?.source.kind === 'opening' && active.source.openingId === link.entry.id) {
				linked.current = active.id;
				return;
			}
			linked.current = loadOpening(link.entry).id;
			return;
		}
		const same = active && sessionLine(active)?.join(' ') === link.uci.join(' ');
		if (same) {
			linked.current = active.id;
			return;
		}
		const tree = treeFromUci(link.uci);
		linked.current = sessionsActions.newSession({ tree, cursor: lineEnd(tree, tree.rootId) }).id;
	}, [index, restored, param]);

	// Switching to another open game (or clearing this one) leaves the link: follow that game.
	const current = activeId.value;
	useEffect(() => {
		if (!linked.current || current === linked.current) return;
		navigate(pathForSession(index, activeSession.value), { replace: true });
	}, [current]);

	const session = activeSession.value;
	if (!index || !restored || !session) {
		return (
			<div class="home home--loading">
				<Spinner label={openingsStatus.value === 'error' ? 'Openings data failed to load' : 'Loading opening'} />
			</div>
		);
	}
	return (
		<div class="home">
			<MovesPanel session={session} />
		</div>
	);
}

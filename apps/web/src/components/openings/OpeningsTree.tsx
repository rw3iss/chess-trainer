// Tree mode: continuations from the ACTIVE session's current position (book +
// live explorer). Clicking a move plays it in the active session (or starts one).
import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { INITIAL_FEN, getNode } from '@chess/core/chess';
import { OpeningHeader } from '@/components/moves/OpeningHeader';
import { activeSession, sessionsActions } from '@/state/sessions';
import { openingIndex } from '@/state/openings';
import { ContinuationsList, type ContinuationItem } from './ContinuationsList';
import { sanLine } from './format';
import './OpeningsTree.scss';

const LINES_LIMIT = 12;

export function OpeningsTree(): JSX.Element {
	const { route } = useLocation();
	const session = activeSession.value;
	const fen = session ? getNode(session.tree, session.cursor).fen : INITIAL_FEN;
	const index = openingIndex.value;
	const lines = useMemo(() => {
		if (!index) return [];
		const ply = session ? getNode(session.tree, session.cursor).ply : 0;
		return index
			.openingsThrough(fen)
			.filter((e) => e.plies > ply)
			.sort((a, b) => (b.popularity?.score ?? -1) - (a.popularity?.score ?? -1) || a.plies - b.plies)
			.slice(0, LINES_LIMIT);
	}, [index, fen]);

	const play = (c: ContinuationItem) => {
		if (!session) sessionsActions.newSession();
		sessionsActions.move(c.uci);
	};

	return (
		<div class="openings-tree">
			{session ? <OpeningHeader session={session} /> : <p class="openings-tree__hint">Starting position — pick a first move to begin a new analysis.</p>}
			<ContinuationsList fen={fen} onPick={play} title="Next moves" />
			{lines.length > 0 && (
				<section class="openings-tree__lines" aria-label="Lines through this position">
					<h3 class="openings-tree__title">Lines from here</h3>
					<ul class="openings-tree__list">
						{lines.map((e) => (
							<li key={e.id}>
								<button type="button" class="openings-tree__line" onClick={() => route(`/openings/${e.id}`)}>
									<span class="openings-tree__eco">{e.eco}</span>
									<span class="openings-tree__name">{e.name}</span>
									<span class="openings-tree__moves">{sanLine(e.san, 10)}</span>
								</button>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}

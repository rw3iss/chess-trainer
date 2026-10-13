// "What comes next" from a position: book moves from the openings graph (names +
// popularity), merged with live Lichess explorer stats (W/D/L, games) when the
// optional server is online. Clicking a move calls onPick.
import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { toEpd } from '@chess/core/chess';
import type { Continuation } from '@chess/core/openings';
import type { ExplorerMove, ExplorerResult } from '@chess/core/protocol';
import { Spinner } from '@/components/common/Spinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { WdlBar } from '@/components/moves/WdlBar';
import { useCachedResource } from '@/hooks/useCachedResource';
import { api } from '@/services/api';
import { serverConnector } from '@/services/server';
import { openingIndex } from '@/state/openings';
import { compactCount } from './format';
import './ContinuationsList.scss';

const EXPLORER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ContinuationItem {
	uci: string;
	san: string;
	name?: string;
	/** Book popularity score 0..100. */
	popularity?: number;
	openingIds: string[];
	explorer?: ExplorerMove;
}

/** Merge book continuations with explorer moves (explorer order wins when present). */
export function mergeContinuations(book: Continuation[], explorer?: ExplorerResult): ContinuationItem[] {
	const byUci = new Map<string, ContinuationItem>();
	for (const c of book) byUci.set(c.uci, { uci: c.uci, san: c.san, name: c.name, popularity: c.popularity, openingIds: c.openingIds });
	if (!explorer?.moves.length) return [...byUci.values()];
	const out: ContinuationItem[] = [];
	for (const m of explorer.moves) {
		const b = byUci.get(m.uci);
		out.push(b ? { ...b, explorer: m } : { uci: m.uci, san: m.san, openingIds: [], explorer: m });
		byUci.delete(m.uci);
	}
	return [...out, ...byUci.values()];
}

export function explorerEnabled(): boolean {
	return serverConnector.isOnline.value && serverConnector.health.value?.features?.explorer !== false;
}

export interface ContinuationsListProps {
	fen: string;
	onPick: (item: ContinuationItem) => void;
	/** Heading shown above the list. */
	title?: string;
	limit?: number;
}

export function ContinuationsList({ fen, onPick, title = 'Continuations', limit = 24 }: ContinuationsListProps): JSX.Element {
	const index = openingIndex.value;
	const live = explorerEnabled();
	const epd = toEpd(fen);
	const book = useMemo(() => (index ? index.continuations(fen) : []), [index, epd]);
	const explorer = useCachedResource<ExplorerResult>(live ? `explorer:lichess:${epd}` : null, () => api.explorer(fen, 'lichess'), EXPLORER_TTL_MS);
	const items = useMemo(() => mergeContinuations(book, live ? explorer.data : undefined).slice(0, limit), [book, explorer.data, live, limit]);

	return (
		<section class="continuations" aria-label={title}>
			<header class="continuations__head">
				<h3 class="continuations__title">{title}</h3>
				{live ? (
					<Badge tone="success" title="Live stats from the Lichess opening explorer">
						{explorer.loading ? <Spinner size={10} label="Loading explorer" /> : null} Live
					</Badge>
				) : (
					<Badge title="Connect a server for live explorer stats">Book</Badge>
				)}
			</header>
			{items.length === 0 ? (
				<EmptyState compact icon="book" title="Out of book" description="No named continuations from this position." />
			) : (
				<ul class="continuations__list">
					{items.map((c) => {
						const games = c.explorer ? c.explorer.white + c.explorer.draws + c.explorer.black : undefined;
						return (
							<li key={c.uci}>
								<button type="button" class="continuations__item" onClick={() => onPick(c)} aria-label={`Play ${c.san}${c.name ? ` — ${c.name}` : ''}`}>
									<span class="continuations__san">{c.san}</span>
									<span class="continuations__name">{c.name ?? (c.openingIds.length ? `${c.openingIds.length} lines` : '—')}</span>
									<span class="continuations__stats">
										{c.explorer && games ? (
											<WdlBar white={c.explorer.white} draws={c.explorer.draws} black={c.explorer.black} />
										) : c.popularity !== undefined ? (
											<span class="continuations__pop" title={`Popularity ${c.popularity}/100`}>
												<span class="continuations__pop-fill" style={{ width: `${Math.max(4, c.popularity)}%` }} />
											</span>
										) : null}
									</span>
									<span class="continuations__games">{games ? compactCount(games) : ''}</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
			{live && explorer.error && <p class="continuations__error">Live stats unavailable — showing book moves.</p>}
		</section>
	);
}

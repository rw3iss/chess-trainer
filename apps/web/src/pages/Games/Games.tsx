// /games — saved games (PLAN §4.3). URL state: ?q&fav&sort&source&mode&result.
// Search / ★ / sort / filters, mini-board thumbnails, open (focuses an open linked
// session), inline rename, duplicate, delete with undo, export (one / all), import PGN.
import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { IconButton } from '@/components/common/IconButton';
import { Spinner } from '@/components/common/Spinner';
import { VirtualList } from '@/components/common/VirtualList';
import {
	GAME_ROW_HEIGHT,
	GameRow,
	GamesToolbar,
	PgnImportModal,
	deleteGameWithUndo,
	duplicateGame,
	exportGame,
	exportGames,
	openGame,
	openingResolver,
	openingsAmong,
	parseGamesQuery,
	queryGames,
	renameGame,
	serializeGamesQuery,
	type GamesQuery,
} from '@/components/games';
import { savedGames, savedGamesActions, savedGamesLoaded } from '@/state/savedGames';
import { openSessions } from '@/state/sessions';
import { openingIdentifier } from '@/state/openingIdentity';
import { useIsStacked } from '@/hooks/useMediaQuery';
import './Games.scss';

export default function Games(): JSX.Element {
	const { query: rawQuery, route } = useLocation();
	const stacked = useIsStacked();
	const [importOpen, setImportOpen] = useState(false);

	const query = useMemo(() => parseGamesQuery(rawQuery), [JSON.stringify(rawQuery)]);
	const all = savedGames.value;
	const identify = openingIdentifier.value;
	const openingOf = useMemo(() => openingResolver(identify), [identify]);
	const list = useMemo(() => queryGames(all, query, openingOf), [all, query, openingOf]);
	const openings = useMemo(() => openingsAmong(all, openingOf), [all, openingOf]);
	const openIds = useMemo(() => new Set(openSessions.value.map((s) => s.savedGameId).filter(Boolean)), [openSessions.value]);

	const setQuery = (next: GamesQuery, opts: { replace?: boolean } = {}) => {
		const qs = serializeGamesQuery(next);
		route(qs ? `/games?${qs}` : '/games', opts.replace);
	};

	const open = (id: string) => {
		if (openGame(id)) route('/');
	};

	const loaded = savedGamesLoaded.value;
	const count = all.length;
	const filtered = list.length !== count;

	return (
		<div class="games-page">
			<header class="games-page__head">
				<div class="games-page__heading">
					<h1 class="games-page__title">Saved games</h1>
					<p class="games-page__sub">
						{!loaded ? 'Loading…' : count === 0 ? 'Nothing saved yet' : filtered ? `${list.length} of ${count} games` : `${count} game${count === 1 ? '' : 's'}`}
					</p>
				</div>
				<div class="games-page__actions">
					<Button variant="secondary" size="sm" icon="upload" onClick={() => setImportOpen(true)}>
						Import
					</Button>
					<IconButton icon="download" label={filtered ? 'Export shown games as PGN' : 'Export all games as PGN'} disabled={!list.length} onClick={() => exportGames(list)} />
				</div>
			</header>

			{!loaded ? (
				<div class="games-page__loading">
					<Spinner size={20} label="Loading saved games" />
				</div>
			) : count === 0 ? (
				<EmptyState
					icon="games"
					title="No saved games yet"
					description={
						<>
							Load an opening, play through it and press <kbd>Ctrl</kbd> <kbd>S</kbd> — or import games from a PGN file.
						</>
					}
				>
					<Button variant="primary" icon="book" onClick={() => route('/openings')}>
						Browse openings
					</Button>
					<Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>
						Import PGN
					</Button>
				</EmptyState>
			) : (
				<>
					<GamesToolbar query={query} onChange={setQuery} openings={openings} autoFocusSearch={false} />
					{list.length === 0 ? (
						<EmptyState icon="search" title="No matching games" description="Try a different search or clear the filters." compact>
							<Button variant="secondary" size="sm" onClick={() => setQuery({ ...parseGamesQuery({}), sort: query.sort })}>
								Clear search & filters
							</Button>
						</EmptyState>
					) : (
						<VirtualList
							class="games-page__list"
							ariaLabel="Saved games"
							items={list}
							itemHeight={GAME_ROW_HEIGHT}
							getKey={(g) => g.id}
							overscan={stacked ? 4 : 6}
							renderItem={(g) => (
								<GameRow
									game={g}
									opening={openingOf(g)}
									isOpen={openIds.has(g.id)}
									onOpen={() => open(g.id)}
									onToggleFavorite={() => void savedGamesActions.toggleFavorite(g.id)}
									onRename={(name) => void renameGame(g.id, name)}
									onDuplicate={() => void duplicateGame(g.id)}
									onExport={() => exportGame(g)}
									onDelete={() => void deleteGameWithUndo(g.id)}
								/>
							)}
						/>
					)}
				</>
			)}

			<PgnImportModal open={importOpen} onClose={() => setImportOpen(false)} />
		</div>
	);
}

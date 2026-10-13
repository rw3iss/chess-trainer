// Search · ★ only · sort · filters (source / opening, mode, result). Controlled by a GamesQuery.
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Input } from '@/components/common/Input';
import { Chip } from '@/components/common/Chip';
import { IconButton } from '@/components/common/IconButton';
import { Select, type SelectOption } from '@/components/common/Select';
import { Button } from '@/components/common/Button';
import { throttle } from '@/lib/throttle';
import { cx } from '@/lib/classNames';
import {
	DEFAULT_GAMES_QUERY,
	OPENING_SOURCE_PREFIX,
	activeFilterCount,
	type GameOpeningInfo,
	type GamesQuery,
	type GamesSort,
	type ModeFilter,
	type ResultFilter,
} from './gamesQuery';
import './GamesToolbar.scss';

const SORT_OPTIONS: SelectOption<GamesSort>[] = [
	{ value: 'updated', label: 'Updated' },
	{ value: 'created', label: 'Created' },
	{ value: 'name', label: 'Name A–Z' },
];
const MODE_OPTIONS: SelectOption<ModeFilter>[] = [
	{ value: 'all', label: 'Any mode' },
	{ value: 'analysis', label: 'Analysis' },
	{ value: 'bot', label: 'vs Bot' },
	{ value: 'local-pvp', label: 'Local 2-player' },
	{ value: 'online', label: 'Online' },
];
const RESULT_OPTIONS: SelectOption<ResultFilter>[] = [
	{ value: 'all', label: 'Any result' },
	{ value: 'white', label: 'White won' },
	{ value: 'black', label: 'Black won' },
	{ value: 'draw', label: 'Draw' },
	{ value: 'ongoing', label: 'Unfinished' },
];
const SOURCE_KIND_OPTIONS: SelectOption<string>[] = [
	{ value: 'all', label: 'Any source' },
	{ value: 'opening', label: 'From an opening' },
	{ value: 'new', label: 'New game' },
	{ value: 'fork', label: 'Fork' },
	{ value: 'import', label: 'Imported PGN' },
	{ value: 'online', label: 'Online' },
];

export interface GamesToolbarProps {
	query: GamesQuery;
	onChange: (next: GamesQuery, opts?: { replace?: boolean }) => void;
	openings: GameOpeningInfo[];
	/** Focus the search field on mount (desktop). */
	autoFocusSearch?: boolean;
}

export function GamesToolbar({ query, onChange, openings, autoFocusSearch }: GamesToolbarProps): JSX.Element {
	const filterCount = activeFilterCount(query);
	const [showFilters, setShowFilters] = useState(filterCount > 0);
	const [text, setText] = useState(query.q);

	// External URL changes (back/forward, clear) → field.
	useEffect(() => setText(query.q), [query.q]);

	const [pushSearch] = useState(() => throttle((q: string, base: GamesQuery) => onChange({ ...base, q }, { replace: true })));
	useEffect(() => () => pushSearch.cancel(), []);

	const sourceOptions: SelectOption<string>[] = [
		...SOURCE_KIND_OPTIONS,
		...openings.map((o) => ({ value: `${OPENING_SOURCE_PREFIX}${o.id}`, label: `${o.eco ? `${o.eco} · ` : ''}${o.name}` })),
	];
	if (!sourceOptions.some((o) => o.value === query.source)) sourceOptions.push({ value: query.source, label: 'Selected opening' });

	return (
		<div class="games-toolbar">
			<div class="games-toolbar__row">
				<Input
					class="games-toolbar__search"
					type="search"
					icon="search"
					placeholder="Search name, tag, opening…"
					aria-label="Search saved games"
					value={text}
					autoFocus={autoFocusSearch}
					onInput={(e) => {
						const v = e.currentTarget.value;
						setText(v);
						pushSearch(v, query);
					}}
					trailing={
						text ? (
							<IconButton
								icon="close"
								label="Clear search"
								size="sm"
								onClick={() => {
									pushSearch.cancel();
									setText('');
									onChange({ ...query, q: '' }, { replace: true });
								}}
							/>
						) : undefined
					}
				/>
			</div>
			<div class="games-toolbar__row games-toolbar__row--controls">
				<Chip icon={query.fav ? 'star-filled' : 'star'} selected={query.fav} onClick={() => onChange({ ...query, fav: !query.fav })} class="games-toolbar__fav">
					Favourites
				</Chip>
				<Button
					variant="ghost"
					size="sm"
					icon="filter"
					class={cx('games-toolbar__filters-toggle', (showFilters || filterCount > 0) && 'games-toolbar__filters-toggle--on')}
					aria-expanded={showFilters}
					aria-controls="games-filters"
					onClick={() => setShowFilters(!showFilters)}
				>
					Filters{filterCount > 0 ? ` · ${filterCount}` : ''}
				</Button>
				<Select class="games-toolbar__sort" ariaLabel="Sort by" value={query.sort} options={SORT_OPTIONS} onChange={(sort) => onChange({ ...query, sort })} />
			</div>
			{showFilters && (
				<div class="games-toolbar__filters" id="games-filters" role="group" aria-label="Filters">
					<Select label="Source" value={query.source} options={sourceOptions} onChange={(source) => onChange({ ...query, source })} />
					<Select label="Mode" value={query.mode} options={MODE_OPTIONS} onChange={(mode) => onChange({ ...query, mode })} />
					<Select label="Result" value={query.result} options={RESULT_OPTIONS} onChange={(result) => onChange({ ...query, result })} />
					{filterCount > 0 && (
						<Button
							variant="ghost"
							size="sm"
							class="games-toolbar__clear"
							onClick={() => onChange({ ...query, source: DEFAULT_GAMES_QUERY.source, mode: DEFAULT_GAMES_QUERY.mode, result: DEFAULT_GAMES_QUERY.result })}
						>
							Clear filters
						</Button>
					)}
				</div>
			)}
		</div>
	);
}

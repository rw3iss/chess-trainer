// /openings — the openings browser (PLAN §4.3): search, filters, sort, grouping,
// virtualized list, preview (desktop card / mobile inline) and a Tree tab with
// continuations for the active session. All view state lives in the URL query.
import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import type { OpeningEntry } from '@chess/core/openings';
import { VirtualList } from '@/components/common/VirtualList';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/common/Button';
import { Tabs } from '@/components/common/Tabs';
import {
	FamilyRow,
	OPENING_ROW_HEIGHT,
	OpeningPreview,
	OpeningRow,
	OpeningsToolbar,
	OpeningsTree,
	buildListItems,
	consumePendingSearchFocus,
	itemKey,
	loadOpening,
	parseViewState,
	viewStateUrl,
	type OpeningListItem,
	type OpeningsViewState,
} from '@/components/openings';
import { favoriteOpeningIds, toggleFavorite } from '@/state/favorites';
import { loadOpenings, openingFamilies, openingIndex, openingSearch, openingsError, openingsStatus, recentOpeningIds, retryLoadOpenings } from '@/state/openings';
import { commands } from '@/services/commands';
import { useIsStacked } from '@/hooks/useMediaQuery';
import { useUIState } from '@/hooks/useUIState';
import { defaultSort } from '@/services/openings/searchCore';
import './Openings.scss';

const INLINE_PREVIEW_ROWS = 4;
const HOVER_PREVIEW_DELAY_MS = 90;

type Tab = 'browse' | 'tree';

function useOpeningResults(state: OpeningsViewState): Int32Array | null {
	const index = openingIndex.value;
	const favs = favoriteOpeningIds.value;
	const recent = recentOpeningIds.value;
	const [results, setResults] = useState<Int32Array | null>(null);
	const seq = useRef(0);
	const sort = state.sort ?? defaultSort(state);
	const favKey = state.fav ? [...favs].join(',') : '';
	const recentKey = sort === 'recent' ? recent.join(',') : '';
	const queryKey = JSON.stringify([state.q.trim(), state.color, state.eco, state.family, state.minPlies, state.maxPlies, state.notes, state.fav, sort, favKey, recentKey]);

	useEffect(() => {
		const search = openingSearch();
		if (!index || !search) return;
		const id = ++seq.current;
		search
			.query(
				{ q: state.q, color: state.color, eco: state.eco, family: state.family, minPlies: state.minPlies, maxPlies: state.maxPlies, notes: state.notes, fav: state.fav, sort },
				{ favoriteIds: [...favs], recentIds: recent },
			)
			.then(
				(r) => id === seq.current && setResults(r),
				(e) => console.error('[openings] search failed', e),
			);
	}, [index, queryKey]);

	return index ? results : null;
}

export default function Openings(): JSX.Element {
	const { query, url, route } = useLocation();
	const routeRef = useRef(route);
	routeRef.current = route;
	const state = useMemo(() => parseViewState(query), [url]);
	const stacked = useIsStacked();
	const status = openingsStatus.value;
	const index = openingIndex.value;
	const entries = index?.all() ?? [];
	const results = useOpeningResults(state);
	const favs = favoriteOpeningIds.value;
	const inputRef = useRef<HTMLInputElement>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [expandedList, setExpandedList] = useUIState<string[]>('openings.expandedFamilies', []);
	const expanded = useMemo(() => new Set(expandedList), [expandedList]);

	useEffect(() => {
		if (status === 'idle') void loadOpenings();
	}, [status]);

	// '/' focuses the search box while this page is mounted (stack: wins over the global handler).
	useEffect(() => {
		if (consumePendingSearchFocus()) inputRef.current?.focus();
		return commands.register('focusSearch', () => {
			if (state.view !== 'browse') routeRef.current(viewStateUrl({ ...state, view: 'browse' }));
			requestAnimationFrame(() => {
				inputRef.current?.focus();
				inputRef.current?.select();
			});
		});
	}, [state]);

	useEffect(() => () => void (hoverTimer.current && clearTimeout(hoverTimer.current)), []);

	const onChange = useCallback((next: OpeningsViewState, opts?: { replace?: boolean }) => routeRef.current(viewStateUrl(next), opts?.replace), []);

	const selected = selectedId ? (index?.byId(selectedId) ?? null) : null;
	const firstResult = results && results.length ? (entries[results[0]!] ?? null) : null;
	// Desktop: the preview follows the selection (hover with intent delay selects too); default = top result.
	const previewEntry: OpeningEntry | null = stacked ? null : (selected ?? firstResult);
	const inlineIndex = stacked && selected ? entries.indexOf(selected) : -1;

	const items = useMemo<OpeningListItem[]>(
		() =>
			results
				? buildListItems(results, entries, {
						group: state.group,
						expanded,
						expandAll: !!state.q.trim() || (results.length <= 40 && state.group === 'family'),
						previewAfter: inlineIndex >= 0 ? inlineIndex : undefined,
						previewRows: INLINE_PREVIEW_ROWS,
					})
				: [],
		[results, entries, state.group, state.q, expanded, inlineIndex],
	);
	const selectedItemIndex = useMemo(() => (selected ? items.findIndex((it) => it.kind === 'opening' && entries[it.index] === selected) : -1), [items, selected]);

	const select = useCallback(
		(e: OpeningEntry) => {
			setSelectedId((cur) => (stacked && cur === e.id ? null : e.id));
		},
		[stacked],
	);
	const hover = useCallback(
		(e: OpeningEntry) => {
			if (stacked) return;
			if (hoverTimer.current) clearTimeout(hoverTimer.current);
			hoverTimer.current = setTimeout(() => setSelectedId(e.id), HOVER_PREVIEW_DELAY_MS);
		},
		[stacked],
	);
	const cancelHover = () => {
		if (hoverTimer.current) clearTimeout(hoverTimer.current);
	};
	const toggleFav = useCallback((e: OpeningEntry) => void toggleFavorite('opening', e.id), []);
	const toggleFamily = useCallback((f: string) => setExpandedList((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f])), [setExpandedList]);
	const opened = () => route('/');

	// ↑/↓ move the selection from the search box; Enter loads it.
	const onSearchKeyDown = (e: KeyboardEvent) => {
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
		const openingItems = items.filter((it): it is Extract<OpeningListItem, { kind: 'opening' }> => it.kind === 'opening');
		if (!openingItems.length) return;
		e.preventDefault();
		const cur = selected ?? (stacked ? null : firstResult);
		const pos = cur ? openingItems.findIndex((it) => entries[it.index] === cur) : -1;
		if (e.key === 'Enter') {
			const target = cur ?? entries[openingItems[0]!.index]!;
			loadOpening(target);
			opened();
			return;
		}
		const next = e.key === 'ArrowDown' ? Math.min(openingItems.length - 1, pos + 1) : Math.max(0, pos - 1);
		cancelHover();
		setSelectedId(entries[openingItems[next]!.index]!.id);
	};

	const renderItem = (item: OpeningListItem): JSX.Element => {
		switch (item.kind) {
			case 'family':
				return <FamilyRow family={item.family} count={item.count} expanded={item.expanded} onToggle={toggleFamily} />;
			case 'preview':
				return (
					<div class="openings-page__inline" style={{ height: `${INLINE_PREVIEW_ROWS * OPENING_ROW_HEIGHT}px` }}>
						<OpeningPreview entry={entries[item.index]!} layout="inline" onClose={() => setSelectedId(null)} onOpened={opened} />
					</div>
				);
			case 'spacer':
				return <span class="openings-page__spacer" aria-hidden="true" />;
			case 'opening': {
				const e = entries[item.index]!;
				return (
					<OpeningRow
						entry={e}
						selected={stacked ? selectedId === e.id : previewEntry === e}
						favorite={favs.has(e.id)}
						compact={state.group === 'family'}
						onSelect={select}
						onHover={stacked ? undefined : hover}
						onToggleFavorite={toggleFav}
					/>
				);
			}
		}
	};

	const tabs = (
		<Tabs<Tab>
			class="openings-page__tabs"
			variant="pill"
			size="sm"
			ariaLabel="Openings view"
			value={state.view}
			onChange={(v) => onChange({ ...state, view: v })}
			items={[
				{ id: 'browse', label: 'Browse', icon: 'book' },
				{ id: 'tree', label: 'Tree', icon: 'fork' },
			]}
		/>
	);

	if (state.view === 'tree') {
		return (
			<div class="openings-page openings-page--tree">
				<header class="openings-page__head">{tabs}</header>
				<div class="openings-page__scroll">{index ? <OpeningsTree /> : <LoadingOrError status={status} />}</div>
			</div>
		);
	}

	let body: JSX.Element;
	if (!index) body = <LoadingOrError status={status} />;
	else if (results && results.length === 0) {
		body = state.fav && favs.size === 0 && !state.q ? (
			<EmptyState icon="star" title="No favorites yet" description="Tap ★ on any opening to keep it here.">
				<Button size="sm" onClick={() => onChange({ ...state, fav: undefined })}>
					Show all openings
				</Button>
			</EmptyState>
		) : (
			<EmptyState icon="search" title="No openings match" description="Try fewer words, a family name, an ECO code (B90) or moves like “e4 c5 Nf3”.">
				<Button size="sm" onClick={() => onChange({ q: '', group: state.group, view: 'browse' })}>
					Clear search and filters
				</Button>
			</EmptyState>
		);
	} else {
		body = (
			<div class="openings-page__list" onMouseLeave={cancelHover}>
				{results && (
					<VirtualList
						items={items}
						itemHeight={OPENING_ROW_HEIGHT}
						renderItem={renderItem}
						getKey={(it) => itemKey(it, entries)}
						overscan={8}
						ariaLabel="Openings"
						scrollToIndex={selectedItemIndex >= 0 ? selectedItemIndex : undefined}
						class="openings-page__virtual"
					/>
				)}
			</div>
		);
	}

	return (
		<div class="openings-page">
			<header class="openings-page__head">{tabs}</header>
			<OpeningsToolbar
				state={state}
				onChange={onChange}
				families={openingFamilies.value}
				resultCount={index ? (results?.length ?? null) : null}
				inputRef={inputRef}
				onSearchKeyDown={onSearchKeyDown}
			/>
			{previewEntry && (
				<div class="openings-page__preview">
					<OpeningPreview entry={previewEntry} onOpened={opened} />
				</div>
			)}
			{body}
		</div>
	);
}

function LoadingOrError({ status }: { status: string }): JSX.Element {
	if (status === 'error')
		return (
			<EmptyState icon="warning" title="Openings unavailable" description={openingsError.value ?? 'The openings data could not be loaded.'}>
				<Button size="sm" icon="undo" onClick={() => void retryLoadOpenings()}>
					Retry
				</Button>
			</EmptyState>
		);
	return (
		<div class="openings-page__loading">
			<Spinner size={22} label="Loading openings" />
			<span>Loading 12,000+ openings…</span>
		</div>
	);
}

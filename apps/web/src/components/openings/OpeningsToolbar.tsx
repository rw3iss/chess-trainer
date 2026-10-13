// Search box + side / ★ / filters / sort / grouping controls for the openings browser.
// The search input is local state, pushed to the URL through a 100 ms throttle.
import type { JSX, Ref } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Input } from '@/components/common/Input';
import { IconButton } from '@/components/common/IconButton';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Select, type SelectOption } from '@/components/common/Select';
import { Chip } from '@/components/common/Chip';
import { Slider } from '@/components/common/Slider';
import { Toggle } from '@/components/common/Toggle';
import { Button } from '@/components/common/Button';
import { throttle } from '@/lib/throttle';
import { cx } from '@/lib/classNames';
import { ECO_LETTERS, defaultSort, type OpeningSort } from '@/services/openings/searchCore';
import type { OpeningFamily } from '@/state/openings';
import { activeFilterCount, clearFilters, type OpeningsViewState } from './urlState';
import './OpeningsToolbar.scss';

export const MAX_LENGTH_FILTER = 30;

const SORT_LABELS: Record<OpeningSort, string> = {
	relevance: 'Best match',
	popularity: 'Popular',
	name: 'Name',
	eco: 'ECO',
	length: 'Shortest',
	white: 'White wins',
	black: 'Black wins',
	recent: 'Recent',
};

type SideValue = 'all' | 'white' | 'black';

export interface OpeningsToolbarProps {
	state: OpeningsViewState;
	onChange: (next: OpeningsViewState, opts?: { replace?: boolean }) => void;
	families: OpeningFamily[];
	resultCount: number | null;
	inputRef?: Ref<HTMLInputElement>;
	onSearchKeyDown?: (e: KeyboardEvent) => void;
}

export function OpeningsToolbar({ state, onChange, families, resultCount, inputRef, onSearchKeyDown }: OpeningsToolbarProps): JSX.Element {
	const [text, setText] = useState(state.q);
	const [open, setOpen] = useState(false);
	const lastPushed = useRef(state.q);
	const stateRef = useRef(state);
	stateRef.current = state;

	// External URL changes (back/forward, chip removal) win over the local draft.
	useEffect(() => {
		if (state.q !== lastPushed.current) {
			lastPushed.current = state.q;
			setText(state.q);
		}
	}, [state.q]);

	const pushQuery = useMemo(
		() =>
			throttle((q: string) => {
				lastPushed.current = q;
				onChange({ ...stateRef.current, q }, { replace: true });
			}, 100),
		[onChange],
	);
	useEffect(() => () => pushQuery.cancel(), [pushQuery]);

	const set = (patch: Partial<OpeningsViewState>) => onChange({ ...state, ...patch });
	const filters = activeFilterCount(state);
	const sort = state.sort ?? defaultSort(state);
	const sortOptions: SelectOption<OpeningSort>[] = (Object.keys(SORT_LABELS) as OpeningSort[])
		.filter((s) => s !== 'relevance' || state.q.trim())
		.map((value) => ({ value, label: SORT_LABELS[value] }));
	const familyOptions: SelectOption<string>[] = useMemo(() => [{ value: '', label: 'All families' }, ...families.map((f) => ({ value: f.name, label: `${f.name} (${f.count})` }))], [families]);

	const toggleEco = (l: string) => {
		const cur = new Set(state.eco ?? []);
		if (cur.has(l)) cur.delete(l);
		else cur.add(l);
		set({ eco: cur.size ? [...cur].sort() : undefined });
	};

	return (
		<div class="openings-toolbar">
			<Input
				class="openings-toolbar__search"
				icon="search"
				type="search"
				inputRef={inputRef}
				placeholder="Search name, ECO or moves (e4 c5 Nf3)"
				aria-label="Search openings"
				autocomplete="off"
				spellcheck={false}
				enterKeyHint="search"
				value={text}
				onInput={(e) => {
					const v = (e.currentTarget as HTMLInputElement).value;
					setText(v);
					pushQuery(v);
				}}
				onKeyDown={(e) => {
					if (e.key === 'Escape' && text) {
						e.preventDefault();
						e.stopPropagation();
						setText('');
						pushQuery('');
						return;
					}
					onSearchKeyDown?.(e);
				}}
				trailing={
					text ? (
						<IconButton
							icon="close"
							label="Clear search"
							size="sm"
							onClick={() => {
								setText('');
								pushQuery('');
							}}
						/>
					) : undefined
				}
			/>
			<div class="openings-toolbar__row">
				<SegmentedControl<SideValue>
					size="sm"
					ariaLabel="Side"
					value={state.color ?? 'all'}
					onChange={(v) => set({ color: v === 'all' ? undefined : v })}
					options={[
						{ value: 'all', label: 'All' },
						{ value: 'white', label: 'White' },
						{ value: 'black', label: 'Black' },
					]}
				/>
				<IconButton icon={state.fav ? 'star-filled' : 'star'} label="Favorites only" size="sm" active={!!state.fav} class={cx({ 'openings-toolbar__fav--on': !!state.fav })} onClick={() => set({ fav: state.fav ? undefined : true })} />
				<IconButton icon="filter" label="Filters" size="sm" active={open} badge={filters || undefined} aria-expanded={open} aria-controls="openings-filters" onClick={() => setOpen((o) => !o)} />
				<span class="openings-toolbar__spacer" />
				<IconButton
					icon={state.group === 'family' ? 'grid' : 'list'}
					label={state.group === 'family' ? 'Grouped by family (show flat list)' : 'Flat list (group by family)'}
					size="sm"
					active={state.group === 'family'}
					onClick={() => set({ group: state.group === 'family' ? 'flat' : 'family' })}
				/>
			</div>
			{open && (
				<div class="openings-toolbar__filters" id="openings-filters">
					<div class="openings-toolbar__field">
						<span class="openings-toolbar__label">ECO</span>
						<div class="openings-toolbar__chips">
							{ECO_LETTERS.map((l) => (
								<Chip key={l} label={l} mono size="sm" selected={!!state.eco?.includes(l)} onClick={() => toggleEco(l)} />
							))}
						</div>
					</div>
					<Select<string> label="Family" value={state.family ?? ''} options={familyOptions} onChange={(v) => set({ family: v || undefined })} />
					<div class="openings-toolbar__range">
						<Slider
							label="Min length"
							min={0}
							max={MAX_LENGTH_FILTER}
							value={state.minPlies ?? 0}
							format={(v) => (v === 0 ? 'any' : `${v} plies`)}
							onChange={(v) => set({ minPlies: v || undefined, maxPlies: state.maxPlies !== undefined && state.maxPlies < v ? v : state.maxPlies })}
						/>
						<Slider
							label="Max length"
							min={1}
							max={MAX_LENGTH_FILTER}
							value={state.maxPlies ?? MAX_LENGTH_FILTER}
							format={(v) => (v >= MAX_LENGTH_FILTER ? 'any' : `${v} plies`)}
							onChange={(v) => set({ maxPlies: v >= MAX_LENGTH_FILTER ? undefined : v, minPlies: state.minPlies !== undefined && state.minPlies > v ? v : state.minPlies })}
						/>
					</div>
					<Toggle label="Has notes" description="Lines with Wikibooks theory" checked={!!state.notes} onChange={(v) => set({ notes: v || undefined })} />
					<Toggle label="Favorites only" checked={!!state.fav} onChange={(v) => set({ fav: v || undefined })} />
				</div>
			)}
			<div class="openings-toolbar__summary">
				<span class="openings-toolbar__count" aria-live="polite">
					{resultCount === null ? 'Searching…' : `${resultCount.toLocaleString()} ${resultCount === 1 ? 'opening' : 'openings'}`}
				</span>
				{state.color && <Chip size="sm" label={state.color === 'white' ? 'White' : 'Black'} onRemove={() => set({ color: undefined })} />}
				{state.fav && <Chip size="sm" icon="star-filled" label="Favorites" onRemove={() => set({ fav: undefined })} />}
				{state.eco?.length ? <Chip size="sm" mono label={`ECO ${state.eco.join('')}`} onRemove={() => set({ eco: undefined })} /> : null}
				{state.family && <Chip size="sm" label={state.family} onRemove={() => set({ family: undefined })} />}
				{(state.minPlies !== undefined || state.maxPlies !== undefined) && (
					<Chip size="sm" label={`${state.minPlies ?? 1}–${state.maxPlies ?? '∞'} plies`} onRemove={() => set({ minPlies: undefined, maxPlies: undefined })} />
				)}
				{state.notes && <Chip size="sm" icon="note" label="Notes" onRemove={() => set({ notes: undefined })} />}
				{filters > 1 && (
					<Button size="sm" variant="ghost" onClick={() => onChange(clearFilters(state))}>
						Clear
					</Button>
				)}
				<span class="openings-toolbar__spacer" />
				<Select<OpeningSort> class="openings-toolbar__sort" ariaLabel="Sort" value={sort} options={sortOptions} onChange={(v) => set({ sort: v === defaultSort(state) ? undefined : v })} />
			</div>
		</div>
	);
}

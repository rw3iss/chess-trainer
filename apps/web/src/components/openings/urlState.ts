// Openings browser view state ⇄ URL query (?q&color&eco&family&len&notes&fav&sort&group&view).
// The URL is the source of truth so back/forward and shared links restore the view.
import type { Color } from '@chess/core/chess';
import { ECO_LETTERS, OPENING_SORTS, type OpeningQuery, type OpeningSort } from '@/services/openings/searchCore';

export type OpeningsGroup = 'flat' | 'family';
export type OpeningsView = 'browse' | 'tree';

export interface OpeningsViewState extends OpeningQuery {
	group: OpeningsGroup;
	view: OpeningsView;
}

export const DEFAULT_VIEW_STATE: OpeningsViewState = { q: '', group: 'flat', view: 'browse' };

function int(v: string | undefined): number | undefined {
	if (v === undefined || v === '') return undefined;
	const n = Number.parseInt(v, 10);
	return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function parseViewState(query: Record<string, string | undefined>): OpeningsViewState {
	const s: OpeningsViewState = { ...DEFAULT_VIEW_STATE, q: query.q ?? '' };
	if (query.color === 'white' || query.color === 'black') s.color = query.color as Color;
	const eco = (query.eco ?? '')
		.toUpperCase()
		.split('')
		.filter((l, i, a) => (ECO_LETTERS as readonly string[]).includes(l) && a.indexOf(l) === i);
	if (eco.length) s.eco = eco.sort();
	if (query.family) s.family = query.family;
	if (query.len) {
		const [a, b] = query.len.split('-');
		const min = int(a);
		const max = int(b);
		if (min !== undefined) s.minPlies = min;
		if (max !== undefined) s.maxPlies = max;
	}
	if (query.notes === '1') s.notes = true;
	if (query.fav === '1') s.fav = true;
	if (query.sort && (OPENING_SORTS as readonly string[]).includes(query.sort)) s.sort = query.sort as OpeningSort;
	if (query.group === 'family') s.group = 'family';
	if (query.view === 'tree') s.view = 'tree';
	return s;
}

/** Query string (without '?'), only non-default keys, stable key order. */
export function serializeViewState(s: OpeningsViewState): string {
	const p = new URLSearchParams();
	if (s.q.trim()) p.set('q', s.q);
	if (s.color) p.set('color', s.color);
	if (s.eco?.length) p.set('eco', [...s.eco].sort().join(''));
	if (s.family) p.set('family', s.family);
	if (s.minPlies !== undefined || s.maxPlies !== undefined) p.set('len', `${s.minPlies ?? ''}-${s.maxPlies ?? ''}`);
	if (s.notes) p.set('notes', '1');
	if (s.fav) p.set('fav', '1');
	if (s.sort) p.set('sort', s.sort);
	if (s.group !== 'flat') p.set('group', s.group);
	if (s.view !== 'browse') p.set('view', s.view);
	return p.toString();
}

export function viewStateUrl(s: OpeningsViewState): string {
	const qs = serializeViewState(s);
	return qs ? `/openings?${qs}` : '/openings';
}

/** Number of active filters (not counting query, sort, grouping). */
export function activeFilterCount(s: OpeningsViewState): number {
	return [s.color, s.eco?.length, s.family, s.minPlies !== undefined || s.maxPlies !== undefined, s.notes, s.fav].filter(Boolean).length;
}

export function clearFilters(s: OpeningsViewState): OpeningsViewState {
	return { q: s.q, sort: s.sort, group: s.group, view: s.view };
}

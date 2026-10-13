import { describe, expect, it } from 'vitest';
import { FIXTURE_OPENINGS } from '@/services/openings/__fixtures__/dataset';
import { activeFilterCount, clearFilters, parseViewState, serializeViewState, viewStateUrl } from '../urlState';
import { buildListItems } from '../listModel';
import { plyLabel, sanLine } from '../format';

describe('openings URL state', () => {
	it('round-trips every key', () => {
		const qs = 'q=e4+c5&color=black&eco=BC&family=Sicilian+Defense&len=4-12&notes=1&fav=1&sort=name&group=family&view=tree';
		const s = parseViewState(Object.fromEntries(new URLSearchParams(qs)));
		expect(s).toEqual({ q: 'e4 c5', color: 'black', eco: ['B', 'C'], family: 'Sicilian Defense', minPlies: 4, maxPlies: 12, notes: true, fav: true, sort: 'name', group: 'family', view: 'tree' });
		expect(serializeViewState(s)).toBe(qs);
		expect(activeFilterCount(s)).toBe(6);
		expect(clearFilters(s)).toEqual({ q: 'e4 c5', sort: 'name', group: 'family', view: 'tree' });
	});

	it('ignores junk and keeps defaults out of the URL', () => {
		const s = parseViewState({ color: 'red', eco: 'zzBb', sort: 'nope', len: 'x-5', group: 'x' });
		expect(s).toEqual({ q: '', eco: ['B'], maxPlies: 5, group: 'flat', view: 'browse' });
		expect(viewStateUrl({ q: '  ', group: 'flat', view: 'browse' })).toBe('/openings');
	});
});

describe('list model', () => {
	const entries = FIXTURE_OPENINGS.openings;
	const all = entries.map((_, i) => i);

	it('flat list with an inline preview block', () => {
		const items = buildListItems([0, 1, 2], entries, { group: 'flat', expanded: new Set(), previewAfter: 1, previewRows: 3 });
		expect(items.map((i) => i.kind)).toEqual(['opening', 'opening', 'preview', 'spacer', 'spacer', 'opening']);
	});

	it('groups by family in result order; collapsed unless expanded', () => {
		const items = buildListItems(all, entries, { group: 'family', expanded: new Set(['Ruy Lopez']) });
		const headers = items.filter((i) => i.kind === 'family');
		expect(headers[0]).toMatchObject({ family: 'Zukertort Opening', count: 1, expanded: false });
		expect(headers.find((h) => h.kind === 'family' && h.family === 'Ruy Lopez')).toMatchObject({ count: 3, expanded: true });
		expect(items.filter((i) => i.kind === 'opening')).toHaveLength(3);
		expect(buildListItems(all, entries, { group: 'family', expanded: new Set(), expandAll: true }).filter((i) => i.kind === 'opening')).toHaveLength(entries.length);
	});
});

describe('format', () => {
	it('numbers SAN lines and plies', () => {
		expect(sanLine(['e4', 'c5', 'Nf3'])).toBe('1.e4 c5 2.Nf3');
		expect(sanLine(['e4', 'c5', 'Nf3'], 2)).toBe('1.e4 c5');
		expect(plyLabel(['e4', 'c5', 'Nf3', 'd6'], 0)).toBe('Start');
		expect(plyLabel(['e4', 'c5', 'Nf3', 'd6'], 3)).toBe('2.Nf3');
		expect(plyLabel(['e4', 'c5', 'Nf3', 'd6'], 4)).toBe('2…d6');
	});
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider } from 'preact-iso';
import Openings from '@/pages/Openings/Openings';
import { fixtureFetch } from '@/services/openings/__fixtures__/dataset';
import { favoriteOpeningIds, resetFavoritesState } from '@/state/favorites';
import { loadOpenings, resetOpeningsState } from '@/state/openings';
import { activeSession, resetSessionsState } from '@/state/sessions';
import { freshRepositories } from '@/state/__tests__/testDb';

function renderAt(url: string) {
	history.replaceState(null, '', url);
	return render(
		<LocationProvider>
			<Openings />
		</LocationProvider>,
	);
}

describe('Openings browser', () => {
	beforeEach(async () => {
		freshRepositories();
		resetFavoritesState();
		resetSessionsState();
		resetOpeningsState();
		await loadOpenings({ source: { baseUrl: '/data', fetch: fixtureFetch().fetch, caches: null }, search: { local: true } });
	});
	afterEach(() => history.replaceState(null, '', '/'));

	it('lists openings, filters from the URL query and toggles favorites', async () => {
		renderAt('/openings?q=sicilian+najdorf');
		const row = await screen.findByRole('button', { name: 'Sicilian Defense: Najdorf Variation, B90' });
		expect(screen.getByText('2 openings')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Italian Game/ })).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Add Sicilian Defense: Najdorf Variation to favorites' }));
		await waitFor(() => expect(favoriteOpeningIds.value.has('najdorf0001')).toBe(true));
		expect(screen.getByRole('button', { name: 'Remove Sicilian Defense: Najdorf Variation from favorites' })).toBeTruthy();

		// ★-only filter writes ?fav=1 and narrows the list.
		fireEvent.click(screen.getByRole('button', { name: 'Favorites only' }));
		await waitFor(() => expect(location.search).toContain('fav=1'));
		await waitFor(() => expect(screen.getByText('1 opening')).toBeTruthy());
		expect(row).toBeTruthy();
	});

	it('previews without touching sessions; Load opens a session', async () => {
		renderAt('/openings?q=italian');
		fireEvent.click(await screen.findByRole('button', { name: 'Italian Game, C50' }));
		const preview = await screen.findByRole('region', { name: 'Preview: Italian Game' });
		expect(preview).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Previous move' }));
		expect(activeSession.value).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Load' }));
		expect(activeSession.value?.source).toMatchObject({ kind: 'opening', openingId: 'italian0001' });
	});

	it('shows an empty state with a reset action', async () => {
		renderAt('/openings?q=zzzzqqq');
		expect(await screen.findByText('No openings match')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
		await waitFor(() => expect(location.search).toBe(''));
	});
});

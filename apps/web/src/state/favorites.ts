// Favorites store — ★ for openings (by stable opening id) and saved games.
// Read: isFavorite(kind, id) (reactive), favoriteOpeningIds, favoriteGameIds.
// Write: toggleFavorite(kind, id) / setFavorite(kind, id, on).
import { computed, signal } from '@preact/signals';
import { getRepositories, type FavoriteKind } from '@/services/db';
import { defineStore } from './registry';

const _ids = signal<Record<FavoriteKind, ReadonlySet<string>>>({ opening: new Set(), game: new Set() });

export const favoriteOpeningIds = computed(() => _ids.value.opening);
export const favoriteGameIds = computed(() => _ids.value.game);

export function isFavorite(kind: FavoriteKind, refId: string): boolean {
	return _ids.value[kind].has(refId);
}

function setLocal(kind: FavoriteKind, refId: string, on: boolean): void {
	const next = new Set(_ids.value[kind]);
	if (on) next.add(refId);
	else next.delete(refId);
	_ids.value = { ..._ids.value, [kind]: next };
}

export async function setFavorite(kind: FavoriteKind, refId: string, on: boolean): Promise<void> {
	if (isFavorite(kind, refId) === on) return;
	setLocal(kind, refId, on); // optimistic
	try {
		const repo = getRepositories().favorites;
		if (on) await repo.add(kind, refId);
		else await repo.remove(kind, refId);
	} catch (e) {
		setLocal(kind, refId, !on);
		throw e;
	}
}

export function toggleFavorite(kind: FavoriteKind, refId: string): Promise<void> {
	return setFavorite(kind, refId, !isFavorite(kind, refId));
}

export async function loadFavorites(): Promise<void> {
	const all = await getRepositories().favorites.list();
	const opening = new Set<string>();
	const game = new Set<string>();
	for (const f of all) (f.kind === 'opening' ? opening : game).add(f.refId);
	_ids.value = { opening, game };
}

export function resetFavoritesState(): void {
	_ids.value = { opening: new Set(), game: new Set() };
}

defineStore({ name: 'favorites', init: loadFavorites });

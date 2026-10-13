// Saved games store (PLAN §3 Save rules).
//   save(sessionId?)            overwrite the linked game; first save of a session = new game
//   saveAs(sessionId?, {name})  always a new game; session re-links to it
//   rename / duplicate / remove (returns undo) / setFavorite / setTags
import { computed, signal } from '@preact/signals';
import { newId } from '@chess/core/chess';
import { linkSessionToSaved, savedGameFromSession, type SavedGame } from '@chess/core/game';
import { getRepositories } from '@/services/db';
import { defineStore } from './registry';
import { getSession, activeId, openSessions, sessionsActions } from './sessions';
import { setFavorite as setFavoriteFlag } from './favorites';

const _games = signal<SavedGame[]>([]);
const _loaded = signal(false);

/** Most recently updated first. */
export const savedGames = computed(() => [..._games.value].sort((a, b) => b.updatedAt - a.updatedAt));
export const savedGamesLoaded = computed(() => _loaded.value);

export function getSavedGame(id: string | undefined): SavedGame | undefined {
	return id ? _games.value.find((g) => g.id === id) : undefined;
}

function upsertLocal(game: SavedGame): void {
	const i = _games.value.findIndex((g) => g.id === game.id);
	_games.value = i >= 0 ? _games.value.map((g) => (g.id === game.id ? game : g)) : [..._games.value, game];
}

async function persist(game: SavedGame): Promise<SavedGame> {
	upsertLocal(game);
	await getRepositories().savedGames.put(game);
	return game;
}

export interface SaveOptions {
	name?: string;
	tags?: string[];
}

export const savedGamesActions = {
	/** Overwrite the linked saved game, or create one on first save. */
	async save(sessionId?: string, opts: SaveOptions = {}): Promise<SavedGame | null> {
		const session = getSession(sessionId ?? activeId.value);
		if (!session) return null;
		const existing = getSavedGame(session.savedGameId);
		if (!existing) return savedGamesActions.saveAs(session.id, opts);
		const game = savedGameFromSession(session, { name: opts.name ?? existing.name, tags: opts.tags ?? existing.tags, asNew: false, existing });
		await persist(game);
		sessionsActions.replace(linkSessionToSaved(session, game));
		return game;
	},

	/** Always create a new saved game; the session re-links to it. */
	async saveAs(sessionId?: string, opts: SaveOptions = {}): Promise<SavedGame | null> {
		const session = getSession(sessionId ?? activeId.value);
		if (!session) return null;
		const game = savedGameFromSession(session, { name: opts.name?.trim() || session.title, tags: opts.tags ?? [], asNew: true });
		await persist(game);
		sessionsActions.replace(linkSessionToSaved(session, game));
		return game;
	},

	async rename(id: string, name: string): Promise<void> {
		const g = getSavedGame(id);
		const n = name.trim();
		if (!g || !n) return;
		await persist({ ...g, name: n, updatedAt: Date.now(), revision: g.revision + 1 });
		// Keep linked open sessions' titles in sync.
		for (const s of openSessions.value) if (s.savedGameId === id) sessionsActions.update({ title: n }, s.id);
	},

	async setTags(id: string, tags: string[]): Promise<void> {
		const g = getSavedGame(id);
		if (!g) return;
		await persist({ ...g, tags, updatedAt: Date.now(), revision: g.revision + 1 });
	},

	async duplicate(id: string): Promise<SavedGame | null> {
		const g = getSavedGame(id);
		if (!g) return null;
		const now = Date.now();
		return persist({ ...g, id: newId(), name: `${g.name} (copy)`, favorite: false, createdAt: now, updatedAt: now, revision: 0, parentGameId: g.id });
	},

	/** Delete; returns an undo function that restores the game. */
	async remove(id: string): Promise<() => Promise<void>> {
		const g = getSavedGame(id);
		if (!g) return async () => {};
		_games.value = _games.value.filter((x) => x.id !== id);
		await getRepositories().savedGames.remove(id);
		return async () => {
			await persist(g);
		};
	},

	async setFavorite(id: string, favorite: boolean): Promise<void> {
		const g = getSavedGame(id);
		if (!g) return;
		await persist({ ...g, favorite, updatedAt: Date.now(), revision: g.revision + 1 });
		await setFavoriteFlag('game', id, favorite);
	},

	toggleFavorite(id: string): Promise<void> {
		const g = getSavedGame(id);
		return g ? savedGamesActions.setFavorite(id, !g.favorite) : Promise.resolve();
	},

	/** Open in a session (focuses an already-open linked session). */
	open(id: string) {
		const g = getSavedGame(id);
		return g ? sessionsActions.fromSavedGame(g) : null;
	},
};

export async function loadSavedGames(): Promise<void> {
	_games.value = await getRepositories().savedGames.list();
	_loaded.value = true;
}

export function resetSavedGamesState(): void {
	_games.value = [];
	_loaded.value = false;
}

defineStore({ name: 'savedGames', init: loadSavedGames });

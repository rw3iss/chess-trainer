// Opening of a saved game = deepest named opening along its mainline, via the
// openings feature's identifier (state/openingIdentity). Cached per game object
// (games are immutable) and per identifier function.
import { ROOT_ID, getNode, lineEnd, uciPathTo } from '@chess/core/chess';
import type { SavedGame } from '@chess/core/game';
import type { OpeningIdentifier } from '@/state/openingIdentity';
import type { GameOpeningInfo, OpeningOf } from './gamesQuery';

let cacheFor: OpeningIdentifier | null = null;
let cache = new WeakMap<SavedGame, GameOpeningInfo | null>();

export function openingOfGame(identify: OpeningIdentifier | null, g: SavedGame): GameOpeningInfo | undefined {
	if (!identify) return undefined;
	if (identify !== cacheFor) {
		cacheFor = identify;
		cache = new WeakMap();
	}
	const hit = cache.get(g);
	if (hit !== undefined) return hit ?? undefined;
	const root = getNode(g.tree, ROOT_ID);
	const entry = identify(uciPathTo(g.tree, lineEnd(g.tree, ROOT_ID)), root.fen);
	const info = entry ? { id: entry.id, name: entry.name, eco: entry.eco } : null;
	cache.set(g, info);
	return info ?? undefined;
}

export function openingResolver(identify: OpeningIdentifier | null): OpeningOf {
	return (g) => openingOfGame(identify, g);
}

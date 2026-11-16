import { describe, expect, it } from 'vitest';
import { encodeLine, lineEnd, treeFromUci } from '@chess/core/chess';
import { createSession } from '@chess/core/game';
import { OpeningIndex } from '@chess/core/openings';
import { FIXTURE_GRAPH, FIXTURE_OPENINGS } from '@/services/openings/__fixtures__/dataset';
import { isBoardLinkPath, pathForSession, resolveLink, shareLink } from './openingLinks';

const index = OpeningIndex.fromData(FIXTURE_OPENINGS, FIXTURE_GRAPH);
const sessionOf = (uci: string[]) => {
	const tree = treeFromUci(uci);
	return createSession({ tree, cursor: lineEnd(tree, tree.rootId) });
};

describe('openingLinks', () => {
	it('board link paths are /openings/<one segment>', () => {
		expect(isBoardLinkPath('/openings/sicilian-defense')).toBe(true);
		expect(isBoardLinkPath('/openings/~AQsG')).toBe(true);
		expect(isBoardLinkPath('/openings')).toBe(false);
		expect(isBoardLinkPath('/openings/sicilian-defense/info')).toBe(false);
	});

	it('resolves slugs, old ids, line codes (to the opening when exact) and bad links', () => {
		const sic = index.bySlug('sicilian-defense')!;
		expect(sic.name).toBe('Sicilian Defense');
		expect(resolveLink(index, 'sicilian-defense')).toEqual({ kind: 'opening', entry: sic });
		expect(resolveLink(index, sic.id)).toEqual({ kind: 'opening', entry: sic });
		expect(resolveLink(index, '~' + encodeLine(['e2e4', 'c7c5']))).toEqual({ kind: 'opening', entry: sic });
		expect(resolveLink(index, '~' + encodeLine(['e2e4', 'c7c5', 'a2a3']))).toEqual({ kind: 'line', uci: ['e2e4', 'c7c5', 'a2a3'] });
		expect(resolveLink(index, '~@@')).toEqual({ kind: 'invalid' });
		expect(resolveLink(index, 'nope')).toEqual({ kind: 'not-found' });
	});

	it('shareLink: the opening when the moves are exactly one, else a line code; none without moves', () => {
		expect(shareLink(index, sessionOf(['e2e4', 'c7c5']))).toMatchObject({ path: '/openings/sicilian-defense' });
		const custom = shareLink(index, sessionOf(['e2e4', 'c7c5', 'a2a3']))!;
		expect(custom.opening).toBeUndefined();
		expect(custom.path).toBe('/openings/~' + encodeLine(['e2e4', 'c7c5', 'a2a3']));
		expect(shareLink(index, sessionOf([]))).toBeNull();
		expect(shareLink(null, sessionOf(['e2e4', 'c7c5']))!.path.startsWith('/openings/~')).toBe(true);
	});

	it('pathForSession: opening sessions keep their link, others go home', () => {
		const sic = index.bySlug('sicilian-defense')!;
		const s = { ...sessionOf(['e2e4', 'c7c5']), source: { kind: 'opening' as const, openingId: sic.id } };
		expect(pathForSession(index, s)).toBe('/openings/sicilian-defense');
		expect(pathForSession(index, sessionOf(['e2e4']))).toBe('/');
		expect(pathForSession(index, null)).toBe('/');
	});
});

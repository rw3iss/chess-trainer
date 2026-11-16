// Deep links for openings and move lines:
//   /openings/<slug>        — an opening (slug from the data; an old opening id also resolves)
//   /openings/~<code>       — any line from the start position (encodeLine: reversible, ~1.4 chars/move)
//   /openings/<slug>/info   — the opening's detail page
// shareLink() picks the opening link when the line is exactly a named opening, else the line code.
import { ROOT_ID, INITIAL_FEN, decodeLine, encodeLine, lineEnd, uciPathTo, type Uci } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import type { OpeningEntry, OpeningIndex } from '@chess/core/openings';

export const LINE_PREFIX = '~';

export const openingPath = (index: OpeningIndex, entry: OpeningEntry): string => `/openings/${encodeURIComponent(index.slugOf(entry))}`;
export const openingInfoPath = (index: OpeningIndex, entry: OpeningEntry): string => `${openingPath(index, entry)}/info`;
export const linePath = (code: string): string => `/openings/${LINE_PREFIX}${code}`;

/** True for a board deep link (/openings/<slug or ~code>), not the browser or a detail page. */
export function isBoardLinkPath(path: string): boolean {
	return /^\/openings\/[^/?]+\/?$/.test(path.split('?')[0]!);
}

export type ResolvedLink =
	| { kind: 'opening'; entry: OpeningEntry }
	| { kind: 'line'; uci: Uci[] }
	| { kind: 'invalid' }
	| { kind: 'not-found' };

/** What a link parameter points to. A line code that is exactly a named opening resolves to the opening. */
export function resolveLink(index: OpeningIndex, param: string): ResolvedLink {
	const p = decodeURIComponent(param);
	if (p.startsWith(LINE_PREFIX)) {
		const uci = decodeLine(p.slice(LINE_PREFIX.length));
		if (!uci) return { kind: 'invalid' };
		const entry = index.byLine(uci);
		return entry ? { kind: 'opening', entry } : { kind: 'line', uci };
	}
	const entry = index.bySlug(p) ?? index.byId(p);
	return entry ? { kind: 'opening', entry } : { kind: 'not-found' };
}

/** Moves of the session's current line (start → end of the cursor's line); null when it does not start from the standard position. */
export function sessionLine(session: Session): Uci[] | null {
	if (session.tree.nodes[ROOT_ID]!.fen.split(' ').slice(0, 4).join(' ') !== INITIAL_FEN.split(' ').slice(0, 4).join(' ')) return null;
	return uciPathTo(session.tree, lineEnd(session.tree, session.cursor));
}

export interface ShareLink {
	path: string;
	/** Named opening the link points to (absent for a custom line). */
	opening?: OpeningEntry;
}

/** Link for the session's line: the opening when the moves are exactly a named opening, else the line code. */
export function shareLink(index: OpeningIndex | null, session: Session): ShareLink | null {
	const uci = sessionLine(session);
	if (!uci || !uci.length) return null;
	const entry = index?.byLine(uci);
	if (entry && index) return { path: openingPath(index, entry), opening: entry };
	const code = encodeLine(uci);
	return code ? { path: linePath(code) } : null;
}

/** The URL a session belongs on: its opening's link while it is an opening session, else '/'. */
export function pathForSession(index: OpeningIndex | null, session: Session | null): string {
	const entry = session?.source.kind === 'opening' && session.source.openingId ? index?.byId(session.source.openingId) : undefined;
	return entry && index ? openingPath(index, entry) : '/';
}

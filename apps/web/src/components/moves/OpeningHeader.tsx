// OpeningHeader — live opening name for the session's cursor: ECO chip + family /
// variation, W/D/L bar when popularity is known, or 'Starting position'.
// `identify` overrides the app-wide identifier (state/openingIdentity).
import { useMemo } from 'preact/hooks';
import type { JSX } from 'preact';
import { INITIAL_FEN, ROOT_ID, getNode, turnFromFen, uciPathTo } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import type { OpeningEntry } from '@chess/core/openings';
import { Chip } from '@/components/common/Chip';
import { openingIdentifier, type OpeningIdentifier } from '@/state/openingIdentity';
import { moveNumber } from './moveLayout';
import { WdlBar } from './WdlBar';
import './OpeningHeader.scss';

export interface OpeningHeaderProps {
	session: Session;
	identify?: OpeningIdentifier;
}

export function OpeningHeader({ session, identify }: OpeningHeaderProps): JSX.Element {
	const fn = identify ?? openingIdentifier.value;
	const node = getNode(session.tree, session.cursor);
	const rootFen = getNode(session.tree, ROOT_ID).fen;
	const entry: OpeningEntry | undefined = useMemo(() => {
		if (!fn || session.cursor === ROOT_ID) return undefined;
		try {
			return fn(uciPathTo(session.tree, session.cursor), rootFen);
		} catch {
			return undefined;
		}
	}, [fn, session.tree, session.cursor, rootFen]);

	const atRoot = session.cursor === ROOT_ID;
	const standardStart = rootFen.split(' ').slice(0, 4).join(' ') === INITIAL_FEN.split(' ').slice(0, 4).join(' ');
	const turn = turnFromFen(node.fen) === 'white' ? 'White' : 'Black';
	const meta = atRoot ? `${turn} to move` : `Move ${moveNumber(node, rootFen)} · ${turn} to move`;

	let title: JSX.Element;
	if (entry) {
		title = (
			<h2 class="opening-header__name">
				<span class="opening-header__family">{entry.family}</span>
				{entry.variation && <span class="opening-header__variation">{entry.variation}</span>}
			</h2>
		);
	} else if (atRoot) {
		title = <h2 class="opening-header__name">{standardStart ? 'Starting position' : 'Custom position'}</h2>;
	} else {
		title = (
			<h2 class="opening-header__name opening-header__name--muted">
				<span class="opening-header__family">{session.title.split(' — ')[0]}</span>
			</h2>
		);
	}

	return (
		<header class="opening-header">
			<div class="opening-header__top">
				{entry ? <Chip label={entry.eco} mono size="sm" tone="accent" title={`ECO ${entry.eco}`} /> : <span class="opening-header__eyebrow">{atRoot ? 'Position' : 'Opening'}</span>}
				<span class="opening-header__meta">{meta}</span>
			</div>
			{title}
			{entry?.popularity && (
				<WdlBar white={entry.popularity.white} draws={entry.popularity.draws} black={entry.popularity.black} games={entry.popularity.games} />
			)}
		</header>
	);
}

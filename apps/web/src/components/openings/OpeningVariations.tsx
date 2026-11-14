// Moves-panel section for the opening of the current line, live as moves are played: the
// openings it is built on ("Built on" chain, root first; "custom +N" after own moves) and the
// named openings that continue from the end of the line ("Variations", or "Next openings" after
// own moves; most popular first, expandable). Click one to load it and play it. "Keep position"
// loads it at the user's current position (plus its next move when playing at the line's end).
import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { ROOT_ID, getNode, lineEnd, mainline, toEpd, treeFromUci, uciPathTo } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import type { NextOpening, OpeningEntry, OpeningIndex } from '@chess/core/openings';
import { Icon } from '@/components/common/Icon';
import { Toggle } from '@/components/common/Toggle';
import { useUISetting } from '@/hooks/useUISetting';
import { sessionsActions } from '@/state/sessions';
import { openingIndex } from '@/state/openings';
import { cx } from '@/lib/classNames';
import { loadOpening } from './actions';
import { compactCount, relativeName, sanLineFrom } from './format';
import { extraLabel } from '@/lib/format';
import { sessionLineStatus } from './lineStatus';
import './OpeningVariations.scss';

/** Rows shown before "Show all" at each level. */
const PAGE = 8;

/**
 * Ply to show after loading `entry` when "Keep position" is on: the user's position (the cursor)
 * when `entry` passes through it — matched by position, so transpositions count — else the last
 * move the two lines share. With `playNext`, when the cursor is at the end of its line (the user
 * is playing it live) and `entry` goes further, the variation's next move is played too.
 */
export function keptPly(session: Session, entry: OpeningEntry, opts: { playNext?: boolean } = {}): number {
	const path = uciPathTo(session.tree, session.cursor);
	const here = toEpd(getNode(session.tree, session.cursor).fen);
	const line = mainline(treeFromUci(entry.uci));
	let k = here === toEpd(session.tree.nodes[ROOT_ID]!.fen) ? 0 : line.findIndex((n) => toEpd(n.fen) === here) + 1;
	if (k <= 0) {
		k = 0;
		while (k < path.length && k < entry.uci.length && path[k] === entry.uci[k]) k++;
		return k;
	}
	const live = session.cursor === lineEnd(session.tree, session.cursor);
	return opts.playNext && live && k < line.length ? k + 1 : k;
}

/** Load an opening from the panel; with `keep`, step the new session to the same position (plus its next move when playing live). */
function loadFromPanel(entry: OpeningEntry, from: Session, keep: boolean): void {
	const ply = keep ? keptPly(from, entry, { playNext: true }) : 0;
	const loaded = loadOpening(entry);
	if (ply <= 0) return;
	const node = mainline(loaded.tree)[ply - 1];
	if (node) sessionsActions.goto(node.id, loaded.id);
}

/**
 * The opening the session's line belongs to: the deepest named opening along the line
 * (from the cursor's line to its end), or the session's source opening when that is deeper.
 */
export function baseOpening(index: OpeningIndex, session: Session): OpeningEntry | undefined {
	return sessionLineStatus(index, session).base;
}

/**
 * Lineage for display: the canonical (Lichess-named) openings only when there are any — the
 * eco.json extras add many in-between steps with repeated names — and each name once (first, so the
 * chain reads general → specific; Lichess reuses a family name for some deeper lines).
 */
export function collapseLineage(list: OpeningEntry[]): OpeningEntry[] {
	const lichess = list.filter((e) => e.source === 'lichess');
	const pick = lichess.length ? lichess : list;
	const seen = new Set<string>();
	return pick.filter((e) => !seen.has(e.name) && !!seen.add(e.name));
}

/** Crumb label: the name relative to the previous crumb; the last move when the name repeats it. */
export function crumbLabel(e: Pick<OpeningEntry, 'name' | 'san' | 'plies'>, prev: string | undefined): string {
	if (prev && e.name === prev) return sanLineFrom(e.san, Math.max(0, e.plies - 1));
	return relativeName(e.name, prev) || e.name;
}

function Popularity({ entry }: { entry: OpeningEntry }): JSX.Element | null {
	const p = entry.popularity;
	if (!p) return null;
	const label = `Popularity ${Math.round(p.score)}/100 · ${compactCount(p.games)} games · White ${Math.round(p.white)}% · Draw ${Math.round(p.draws)}% · Black ${Math.round(p.black)}%`;
	return (
		<span class="opening-vars__pop" title={label} role="img" aria-label={label}>
			<span class="opening-vars__pop-fill" style={{ width: `${Math.max(4, p.score)}%` }} />
		</span>
	);
}

interface VariationListProps {
	index: OpeningIndex;
	parent: OpeningEntry;
	depth: number;
	onLoad: (entry: OpeningEntry) => void;
	/** Rows to list (default: the parent's variations), each with the ply its moves start from. */
	items?: NextOpening[];
}

function VariationList({ index, parent, depth, onLoad, items }: VariationListProps): JSX.Element {
	const all = items ?? index.variations(parent.id).map((entry) => ({ entry, fromPly: parent.plies }));
	const [showAll, setShowAll] = useState(false);
	const shown = showAll ? all : all.slice(0, PAGE);
	return (
		<ul class={cx('opening-vars__list', depth > 0 && 'opening-vars__list--nested')} role={depth ? 'group' : 'list'}>
			{shown.map((v) => (
				<VariationRow key={v.entry.id} index={index} entry={v.entry} fromPly={v.fromPly} parent={parent} depth={depth} onLoad={onLoad} />
			))}
			{all.length > PAGE && (
				<li>
					<button type="button" class="opening-vars__more" onClick={() => setShowAll(!showAll)}>
						{showAll ? 'Show fewer' : `Show all ${all.length}`}
					</button>
				</li>
			)}
		</ul>
	);
}

interface VariationRowProps {
	index: OpeningIndex;
	entry: OpeningEntry;
	fromPly: number;
	parent: OpeningEntry;
	depth: number;
	onLoad: (entry: OpeningEntry) => void;
}

function VariationRow({ index, entry, fromPly, parent, depth, onLoad }: VariationRowProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const sub = index.variationCount(entry.id);
	const label = relativeName(entry.name, parent.name);
	const moves = sanLineFrom(entry.san, fromPly);
	return (
		<li class="opening-vars__item">
			<div class="opening-vars__row">
				{sub > 0 ? (
					<button
						type="button"
						class={cx('opening-vars__toggle', open && 'opening-vars__toggle--open')}
						aria-expanded={open}
						aria-label={`${open ? 'Hide' : 'Show'} ${sub} variations of ${entry.name}`}
						onClick={() => setOpen(!open)}
					>
						<Icon name="chevron-right" size={14} />
					</button>
				) : (
					<span class="opening-vars__toggle opening-vars__toggle--leaf" aria-hidden="true" />
				)}
				<button type="button" class="opening-vars__load" title={`Load ${entry.name} (${entry.eco})`} onClick={() => onLoad(entry)}>
					<span class="opening-vars__main">
						<span class="opening-vars__moves">{moves}</span>
						{label && <span class="opening-vars__name">{label}</span>}
					</span>
					<span class="opening-vars__side">
						<Popularity entry={entry} />
						{sub > 0 && <span class="opening-vars__count">+{sub}</span>}
					</span>
					<Icon name="play" size={14} class="opening-vars__play" />
				</button>
			</div>
			{open && <VariationList index={index} parent={entry} depth={depth + 1} onLoad={onLoad} />}
		</li>
	);
}

export function OpeningVariations({ session }: { session: Session }): JSX.Element | null {
	const index = openingIndex.value;
	const lineKey = useMemo(() => uciPathTo(session.tree, lineEnd(session.tree, session.cursor)).join(' '), [session.tree, session.cursor]);
	const status = useMemo(() => (index ? sessionLineStatus(index, session) : undefined), [index, lineKey, session.source.openingId]);
	const next = useMemo(() => (index && status ? index.nextOpenings(status.fen) : []), [index, status]);
	const [keep, setKeep] = useUISetting('openings.keepPosition');
	const base = status?.base;
	if (!index || !status || !base) return null;
	const onLoad = (entry: OpeningEntry) => loadFromPanel(entry, session, keep);
	const lineage = collapseLineage(index.lineage(base.id));
	const count = next.reduce((n, v) => n + 1 + index.variationCount(v.entry.id), 0);
	const extra = extraLabel(status);
	if (!lineage.length && !count && !extra) return null;

	return (
		<section class="opening-vars" aria-label="Opening variations">
			{(lineage.length > 0 || extra) && (
				<div class="opening-vars__lineage">
					<span class="opening-vars__eyebrow">Built on</span>
					<ol class="opening-vars__crumbs">
						{lineage.map((e, i) => (
							<li key={e.id}>
								<button type="button" class="opening-vars__crumb" title={`Load ${e.name} — ${sanLineFrom(e.san, 0)}`} onClick={() => onLoad(e)}>
									{crumbLabel(e, lineage[i - 1]?.name)}
								</button>
							</li>
						))}
						<li>
							{extra ? (
								<button type="button" class="opening-vars__crumb" title={`Load ${base.name} — ${sanLineFrom(base.san, 0)}`} onClick={() => onLoad(base)}>
									{crumbLabel(base, lineage[lineage.length - 1]?.name)}
								</button>
							) : (
								<span class="opening-vars__crumb opening-vars__crumb--current" aria-current="true" title={base.name}>
									{crumbLabel(base, lineage[lineage.length - 1]?.name)}
								</span>
							)}
						</li>
						{extra && (
							<li>
								<span class="opening-vars__crumb opening-vars__crumb--current opening-vars__crumb--custom" aria-current="true" title={extra.title}>
									{extra.text}
								</span>
							</li>
						)}
					</ol>
				</div>
			)}
			{count > 0 ? (
				<div class="opening-vars__vars">
					<div class="opening-vars__head">
						<span class="opening-vars__eyebrow">{extra ? 'Next openings' : 'Variations'}</span>
						<span class="opening-vars__total">{count} lines</span>
						<Toggle
							class="opening-vars__keep"
							checked={keep}
							onChange={setKeep}
							label="Keep position"
						/>
					</div>
					<VariationList key={status.fen} index={index} parent={base} depth={0} onLoad={onLoad} items={next} />
				</div>
			) : (
				extra && <p class="opening-vars__empty">{status.inBook ? 'No named opening continues from here.' : 'Out of book: no named opening continues from here.'}</p>
			)}
		</section>
	);
}

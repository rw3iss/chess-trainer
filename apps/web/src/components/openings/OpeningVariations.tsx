// Moves-panel section for the opening of the current line: the openings it is built on
// ("Built on" chain, root first) and the named variations that extend it (most popular
// first, expandable into deeper variations). Click a variation to load it and play it.
// "Keep position" loads it with the board stepped to the user's current position in the line.
import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { ROOT_ID, lineEnd, mainline, uciPathTo } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import type { OpeningEntry, OpeningIndex } from '@chess/core/openings';
import { Icon } from '@/components/common/Icon';
import { Toggle } from '@/components/common/Toggle';
import { useUISetting } from '@/hooks/useUISetting';
import { sessionsActions } from '@/state/sessions';
import { openingIndex } from '@/state/openings';
import { cx } from '@/lib/classNames';
import { loadOpening } from './actions';
import { compactCount, relativeName, sanLineFrom } from './format';
import './OpeningVariations.scss';

/** Rows shown before "Show all" at each level. */
const PAGE = 8;

/**
 * Ply to show after loading `entry` when "Keep position" is on: the user's position in the current
 * line (cursor ply), or the last move the two lines share when the user has gone off the new line.
 */
export function keptPly(session: Session, entry: OpeningEntry): number {
	const path = uciPathTo(session.tree, session.cursor);
	let k = 0;
	while (k < path.length && k < entry.uci.length && path[k] === entry.uci[k]) k++;
	return k;
}

/** Load an opening from the panel; with `keep`, step the new session to the same position. */
function loadFromPanel(entry: OpeningEntry, from: Session, keep: boolean): void {
	const ply = keep ? keptPly(from, entry) : 0;
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
	const path = uciPathTo(session.tree, lineEnd(session.tree, session.cursor));
	const startFen = session.tree.nodes[ROOT_ID]!.fen;
	const found = index.identifyLine(path, startFen);
	const src = session.source.openingId ? index.byId(session.source.openingId) : undefined;
	const srcOnLine = src && src.uci.length <= path.length && src.uci.every((u, i) => path[i] === u) ? src : undefined;
	if (!found) return srcOnLine;
	return srcOnLine && srcOnLine.plies > found.plies ? srcOnLine : found;
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
}

function VariationList({ index, parent, depth, onLoad }: VariationListProps): JSX.Element {
	const all = index.variations(parent.id);
	const [showAll, setShowAll] = useState(false);
	const shown = showAll ? all : all.slice(0, PAGE);
	return (
		<ul class={cx('opening-vars__list', depth > 0 && 'opening-vars__list--nested')} role={depth ? 'group' : 'list'}>
			{shown.map((v) => (
				<VariationRow key={v.id} index={index} entry={v} parent={parent} depth={depth} onLoad={onLoad} />
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

function VariationRow({ index, entry, parent, depth, onLoad }: { index: OpeningIndex; entry: OpeningEntry; parent: OpeningEntry; depth: number; onLoad: (entry: OpeningEntry) => void }): JSX.Element {
	const [open, setOpen] = useState(false);
	const sub = index.variationCount(entry.id);
	const label = relativeName(entry.name, parent.name);
	const moves = sanLineFrom(entry.san, parent.plies);
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
	const base = useMemo(() => (index ? baseOpening(index, session) : undefined), [index, lineKey, session.source.openingId]);
	const [keep, setKeep] = useUISetting('openings.keepPosition');
	if (!index || !base) return null;
	const onLoad = (entry: OpeningEntry) => loadFromPanel(entry, session, keep);
	const lineage = collapseLineage(index.lineage(base.id));
	const count = index.variationCount(base.id);
	if (!lineage.length && !count) return null;

	return (
		<section class="opening-vars" aria-label="Opening variations">
			{lineage.length > 0 && (
				<div class="opening-vars__lineage">
					<span class="opening-vars__eyebrow">Built on</span>
					<ol class="opening-vars__crumbs">
						{lineage.map((e, i) => (
							<li key={e.id}>
								<button type="button" class="opening-vars__crumb" title={`Load ${e.name} — ${sanLineFrom(e.san, 0)}`} onClick={() => onLoad(e)}>
									{relativeName(e.name, lineage[i - 1]?.name) || e.name}
								</button>
							</li>
						))}
						<li>
							<span class="opening-vars__crumb opening-vars__crumb--current" aria-current="true" title={base.name}>
								{relativeName(base.name, lineage[lineage.length - 1]?.name) || base.name}
							</span>
						</li>
					</ol>
				</div>
			)}
			{count > 0 && (
				<div class="opening-vars__vars">
					<div class="opening-vars__head">
						<span class="opening-vars__eyebrow">Variations</span>
						<span class="opening-vars__total">{count} lines</span>
						<Toggle
							class="opening-vars__keep"
							checked={keep}
							onChange={setKeep}
							label="Keep position"
						/>
					</div>
					<VariationList key={base.id} index={index} parent={base} depth={0} onLoad={onLoad} />
				</div>
			)}
		</section>
	);
}

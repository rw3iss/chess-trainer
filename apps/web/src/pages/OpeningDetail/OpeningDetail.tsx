// /openings/:id — opening detail: header (name, ECO, family, aliases), preview
// board + stepper, full move list, theory notes along the line (with
// attribution), popularity stats, continuations, Load / Fork / ★.
import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { ROOT_ID, getNode } from '@chess/core/chess';
import { openingId, type OpeningEntry, type OpeningNote } from '@chess/core/openings';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { Chip } from '@/components/common/Chip';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { StageMiniBoard } from '@/components/stage/BoardStage';
import { MoveList, type MoveListActions } from '@/components/moves/MoveList';
import { WdlBar } from '@/components/moves/WdlBar';
import { ContinuationsList, NoteBody, PlyScrubber, compactCount, forkOpeningAt, loadOpening, plyLabel, usePreviewLine, type ContinuationItem } from '@/components/openings';
import { isFavorite, toggleFavorite } from '@/state/favorites';
import { loadDatasetNote, loadOpenings, markOpeningViewed, openingIndex, openingsManifest, openingsStatus, retryLoadOpenings } from '@/state/openings';
import { cx } from '@/lib/classNames';
import './OpeningDetail.scss';

interface LineNote {
	ply: number;
	note: OpeningNote;
}

/** Dataset notes for every position along the line (start … final). */
function useLineNotes(entry: OpeningEntry | null, fens: string[]): LineNote[] | null {
	const [notes, setNotes] = useState<LineNote[] | null>(null);
	useEffect(() => {
		if (!entry) return;
		let alive = true;
		setNotes(null);
		Promise.all(fens.map((f, ply) => loadDatasetNote(f).then((note) => (note ? { ply, note } : null), () => null))).then((list) => {
			if (alive) setNotes(list.filter((x): x is LineNote => !!x));
		});
		return () => {
			alive = false;
		};
	}, [entry]);
	return notes;
}

export default function OpeningDetail(): JSX.Element {
	const { params } = useRoute();
	const { route } = useLocation();
	const id = params.id ?? '';
	const status = openingsStatus.value;
	const index = openingIndex.value;
	const entry = index?.byId(id) ?? null;

	useEffect(() => {
		if (status === 'idle') void loadOpenings();
	}, [status]);
	useEffect(() => {
		if (entry) markOpeningViewed(entry.id);
	}, [entry]);

	if (!index) {
		return (
			<div class="opening-detail opening-detail--state">
				{status === 'error' ? (
					<EmptyState icon="warning" title="Openings unavailable" description="The openings data could not be loaded.">
						<Button size="sm" onClick={() => void retryLoadOpenings()}>
							Retry
						</Button>
					</EmptyState>
				) : (
					<Spinner size={22} label="Loading opening" />
				)}
			</div>
		);
	}
	if (!entry) {
		return (
			<div class="opening-detail opening-detail--state">
				<EmptyState icon="book" title="Opening not found" description="This opening is not in the current dataset.">
					<Button size="sm" onClick={() => route('/openings')}>
						Browse openings
					</Button>
				</EmptyState>
			</div>
		);
	}
	return <OpeningDetailView entry={entry} />;
}

function OpeningDetailView({ entry }: { entry: OpeningEntry }): JSX.Element {
	const { route } = useLocation();
	const preview = usePreviewLine(entry);
	const session = preview.session!;
	const fens = useMemo(() => {
		const out: string[] = [];
		let node = getNode(session.tree, ROOT_ID);
		out.push(node.fen);
		while (node.children[0]) {
			node = getNode(session.tree, node.children[0]);
			out.push(node.fen);
		}
		return out;
	}, [entry]);
	const lineNotes = useLineNotes(entry, fens);
	const fav = isFavorite('opening', entry.id);
	const currentFen = fens[preview.ply] ?? fens[fens.length - 1]!;
	const currentNote = lineNotes?.find((n) => n.ply === preview.ply);
	const manifest = openingsManifest.value;
	const index = openingIndex.value!;

	const actions: MoveListActions = {
		goto: (nodeId) => preview.setPly(preview.plyOf(nodeId)),
		fork: (nodeId) => forkOpeningAt(entry, preview.plyOf(nodeId)),
		deleteFrom: () => {},
		promote: () => {},
		editNote: () => {},
	};

	const pickContinuation = (c: ContinuationItem) => {
		const exact = index.byId(openingId([...entry.uci.slice(0, preview.ply), c.uci]));
		const target = exact ?? c.openingIds.map((oid) => index.byId(oid)).find((e): e is OpeningEntry => !!e);
		if (target) route(`/openings/${target.id}`);
	};

	const p = entry.popularity;
	return (
		<article class="opening-detail">
			<nav class="opening-detail__nav">
				<Button size="sm" variant="ghost" icon="chevron-left" onClick={() => (history.length > 1 ? history.back() : route('/openings'))}>
					Openings
				</Button>
			</nav>
			<header class="opening-detail__head">
				<div class="opening-detail__eyebrow">
					<Chip label={entry.eco} mono size="sm" tone="accent" title={`ECO ${entry.eco}`} />
					<span class="opening-detail__family">{entry.family}</span>
					<span class={cx('opening-detail__side', `opening-detail__side--${entry.perspective}`)}>{entry.perspective === 'white' ? 'White' : 'Black'}</span>
				</div>
				<h1 class="opening-detail__name">{entry.variation ?? entry.name}</h1>
				{entry.aliases?.length ? <p class="opening-detail__aliases">Also known as {entry.aliases.slice(0, 4).join(' · ')}</p> : null}
				<div class="opening-detail__actions">
					<Button
						variant="primary"
						icon="play"
						onClick={() => {
							loadOpening(entry);
							route('/');
						}}
					>
						Load
					</Button>
					<Button
						icon="fork"
						onClick={() => {
							forkOpeningAt(entry, preview.ply);
							route('/');
						}}
					>
						{preview.ply === preview.plies ? 'Fork' : `Fork at ${plyLabel(entry.san, preview.ply)}`}
					</Button>
					<IconButton icon={fav ? 'star-filled' : 'star'} label={fav ? 'Remove from favorites' : 'Add to favorites'} active={fav} class={cx({ 'opening-detail__star--on': fav })} onClick={() => void toggleFavorite('opening', entry.id)} />
				</div>
			</header>

			<section class="opening-detail__board-card" aria-label="Line preview">
				<div class="opening-detail__board">
					<StageMiniBoard session={session} />
				</div>
				<div class="opening-detail__line">
					<PlyScrubber ply={preview.ply} san={entry.san} onChange={preview.setPly} />
					<div class="opening-detail__moves">
						<MoveList session={session} actions={actions} />
					</div>
				</div>
			</section>

			<section class="opening-detail__section" aria-label="Theory">
				<h2 class="opening-detail__title">Theory</h2>
				{lineNotes === null ? (
					<Spinner size={16} label="Loading notes" />
				) : currentNote ? (
					<div class="opening-detail__note">
						<span class="opening-detail__note-at">At {plyLabel(entry.san, currentNote.ply)}</span>
						<NoteBody note={currentNote.note} />
					</div>
				) : (
					<p class="opening-detail__muted">{lineNotes.length ? 'No notes for this exact position — jump to one below.' : 'No theory notes for this line yet.'}</p>
				)}
				{lineNotes && lineNotes.length > 0 && (
					<div class="opening-detail__note-chips" role="group" aria-label="Positions with notes">
						{lineNotes.map((n) => (
							<Chip key={n.ply} size="sm" icon="note" label={plyLabel(entry.san, n.ply)} selected={n.ply === preview.ply} onClick={() => preview.setPly(n.ply)} />
						))}
					</div>
				)}
			</section>

			<section class="opening-detail__section" aria-label="Popularity">
				<h2 class="opening-detail__title">Popularity</h2>
				{p ? (
					<div class="opening-detail__stats">
						<WdlBar white={p.white} draws={p.draws} black={p.black} games={p.games} />
						<dl class="opening-detail__facts">
							<div>
								<dt>Games</dt>
								<dd>{compactCount(p.games)}</dd>
							</div>
							{p.mastersGames !== undefined && (
								<div>
									<dt>Masters</dt>
									<dd>{compactCount(p.mastersGames)}</dd>
								</div>
							)}
							<div>
								<dt>Popularity</dt>
								<dd>{p.score}/100</dd>
							</div>
							<div>
								<dt>Length</dt>
								<dd>{entry.plies} plies</dd>
							</div>
						</dl>
					</div>
				) : (
					<p class="opening-detail__muted">No game statistics for this line. Rare lines have no explorer data.</p>
				)}
			</section>

			<section class="opening-detail__section">
				<ContinuationsList fen={currentFen} onPick={pickContinuation} title={preview.ply === preview.plies ? 'Continuations' : `Continuations after ${plyLabel(entry.san, preview.ply)}`} limit={12} />
			</section>

			{manifest && (
				<footer class="opening-detail__attribution">
					{manifest.attribution.map((a) => (
						<p key={a}>{a}</p>
					))}
				</footer>
			)}
		</article>
	);
}

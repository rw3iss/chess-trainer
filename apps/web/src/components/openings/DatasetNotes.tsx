// Dataset (Wikibooks) note for a position, with attribution. Registered into
// notesSlots.dataset so the Moves panel's NotesCard shows it; also used on the
// opening detail page.
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { OpeningNote } from '@chess/core/openings';
import type { DatasetNotesSlotProps } from '@/components/moves/notesSlots';
import { Icon } from '@/components/common/Icon';
import { loadDatasetNote, openingIndex } from '@/state/openings';
import { cx } from '@/lib/classNames';
import './DatasetNotes.scss';

const COLLAPSE_CHARS = 420;

/** Async note lookup for an EPD (undefined while loading, null when none). */
export function useDatasetNote(epd: string): OpeningNote | null | undefined {
	const index = openingIndex.value;
	const [note, setNote] = useState<OpeningNote | null | undefined>(undefined);
	useEffect(() => {
		let alive = true;
		setNote(undefined);
		if (!index) return;
		loadDatasetNote(epd).then(
			(n) => alive && setNote(n ?? null),
			() => alive && setNote(null),
		);
		return () => {
			alive = false;
		};
	}, [epd, index]);
	return note;
}

export function NoteBody({ note, collapsible = true }: { note: OpeningNote; collapsible?: boolean }): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const long = collapsible && note.text.length > COLLAPSE_CHARS;
	const paragraphs = note.text.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean);
	return (
		<div class={cx('dataset-note', { 'dataset-note--clamped': long && !expanded })}>
			<div class="dataset-note__text">
				{paragraphs.map((p, i) => (
					<p key={i}>{p}</p>
				))}
			</div>
			<footer class="dataset-note__foot">
				{long && (
					<button type="button" class="dataset-note__more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
						{expanded ? 'Show less' : 'Read more'}
					</button>
				)}
				<a class="dataset-note__source" href={note.url} target="_blank" rel="noopener noreferrer">
					{note.source}
					<Icon name="external" size={12} />
				</a>
			</footer>
		</div>
	);
}

/** notesSlots.dataset component. Renders nothing when the position has no note. */
export function DatasetNotes({ epd }: DatasetNotesSlotProps): JSX.Element | null {
	const note = useDatasetNote(epd);
	if (!note) return null;
	return (
		<section class="dataset-notes" aria-label="Opening theory">
			<span class="dataset-notes__title">
				<Icon name="book" size={14} /> Theory
			</span>
			<NoteBody note={note} />
		</section>
	);
}

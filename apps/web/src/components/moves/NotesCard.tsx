// NotesCard — notes for the CURRENT POSITION (keyed by EPD, so transpositions
// share notes): dataset notes slot (filled by the openings feature) + the
// user's own note, autosaved (debounced) to NotesRepository.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { toEpd } from '@chess/core/chess';
import { Textarea } from '@/components/common/Input';
import { Icon } from '@/components/common/Icon';
import { isNoteLoaded, loadNote, noteFor, saveNote } from '@/state/notes';
import { debounce } from '@/lib/throttle';
import { notesSlots } from './notesSlots';
import './NotesCard.scss';

const SAVE_DEBOUNCE_MS = 600;

export function NotesCard({ fen }: { fen: string }): JSX.Element {
	const epd = toEpd(fen);
	const stored = noteFor(epd);
	const loaded = isNoteLoaded(epd);
	const [draft, setDraft] = useState(stored);
	const [saved, setSaved] = useState(true);

	useEffect(() => {
		void loadNote(epd);
	}, [epd]);

	// Reset the editor when the position changes or the stored note arrives.
	useEffect(() => {
		setDraft(stored);
		setSaved(true);
	}, [epd, loaded]);

	const persist = useMemo(
		() =>
			debounce((key: string, text: string) => {
				void saveNote(key, text).then(() => setSaved(true));
			}, SAVE_DEBOUNCE_MS),
		[],
	);
	useEffect(() => () => persist.flush(), [persist]);
	useEffect(() => () => persist.flush(), [epd, persist]);

	return (
		<section class="notes-card" aria-label="Position notes">
			<notesSlots.dataset.Render epd={epd} fen={fen} />
			<div class="notes-card__user">
				<div class="notes-card__head">
					<span class="notes-card__title">
						<Icon name="note" size={14} /> Your notes
					</span>
					<span class="notes-card__status" aria-live="polite">
						{saved ? (draft.trim() ? 'Saved' : '') : 'Saving…'}
					</span>
				</div>
				<Textarea
					aria-label="Your notes for this position"
					placeholder="Ideas, plans, traps to remember for this position…"
					value={draft}
					rows={3}
					onInput={(e) => {
						const v = (e.currentTarget as HTMLTextAreaElement).value;
						setDraft(v);
						setSaved(false);
						persist(epd, v);
					}}
					onBlur={() => persist.flush()}
				/>
			</div>
		</section>
	);
}

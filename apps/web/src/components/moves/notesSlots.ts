// NotesCard extension slot: dataset (Wikibooks) notes for a position.
//   notesSlots.dataset.register(DatasetNotes)  — openings feature
import { createSlot } from '@/app/slots';

export interface DatasetNotesSlotProps {
	epd: string;
	fen: string;
}

export const notesSlots = {
	dataset: createSlot<DatasetNotesSlotProps>('notes.dataset'),
};

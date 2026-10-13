/**
 * Re-exports the pure helpers from packages/core/src/openings (source import so the
 * pipeline does not need a built @chess/core).
 */
export { openingId, splitName } from '../../../packages/core/src/openings/id.js';
export { notesChunkOf } from '../../../packages/core/src/openings/openingIndex.js';
export type {
	GraphFile,
	NotesFile,
	OpeningEntry,
	OpeningNote,
	OpeningPopularity,
	OpeningsFile,
	OpeningsManifest,
} from '../../../packages/core/src/openings/types.js';

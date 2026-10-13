// User notes per position (keyed by EPD) — NotesRepository-backed with an
// in-memory cache signal so the NotesCard re-renders instantly.
import { computed, signal } from '@preact/signals';
import { getRepositories } from '@/services/db';
import { defineStore } from './registry';

const _notes = signal<Record<string, string>>({});
const _loaded = signal<ReadonlySet<string>>(new Set());

export const userNotes = computed(() => _notes.value);

export function noteFor(epd: string): string {
	return _notes.value[epd] ?? '';
}

export function isNoteLoaded(epd: string): boolean {
	return _loaded.value.has(epd);
}

/** Ensure the note for this EPD is in memory. */
export async function loadNote(epd: string): Promise<string> {
	if (_loaded.value.has(epd)) return noteFor(epd);
	const rec = await getRepositories().notes.get(epd);
	_notes.value = rec ? { ..._notes.value, [epd]: rec.text } : _notes.value;
	_loaded.value = new Set([..._loaded.value, epd]);
	return rec?.text ?? '';
}

export async function saveNote(epd: string, text: string): Promise<void> {
	const { [epd]: _old, ...rest } = _notes.value;
	_notes.value = text.trim() ? { ...rest, [epd]: text } : rest;
	_loaded.value = new Set([..._loaded.value, epd]);
	await getRepositories().notes.set(epd, text);
}

export function resetNotesState(): void {
	_notes.value = {};
	_loaded.value = new Set();
}

defineStore({ name: 'notes' });

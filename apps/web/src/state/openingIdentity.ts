// Opening identification hook-point. The openings feature (OpeningIndex) calls
// setOpeningIdentifier(fn) once its dataset is loaded; OpeningHeader reads it.
//   setOpeningIdentifier((uci) => index.identifyLine(uci));
import { computed, signal } from '@preact/signals';
import type { Uci } from '@chess/core/chess';
import type { OpeningEntry } from '@chess/core/openings';

/** Deepest named opening along the line `uci` (from `startFen`, default initial). */
export type OpeningIdentifier = (uci: Uci[], startFen?: string) => OpeningEntry | undefined;

const _identifier = signal<OpeningIdentifier | null>(null);

export const openingIdentifier = computed(() => _identifier.value);

export function setOpeningIdentifier(fn: OpeningIdentifier | null): void {
	_identifier.value = fn;
}

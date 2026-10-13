// Open state for the game dialogs (new game, resign, draw offer). The host
// (GameDialogsHost) renders whichever is open.
import { signal } from '@preact/signals';
import type { NewGameMode } from './newGameForm';

export type GameDialog = { kind: 'new'; mode?: NewGameMode } | { kind: 'resign' } | { kind: 'draw' } | null;

export const gameDialog = signal<GameDialog>(null);

export function openNewGame(mode?: NewGameMode): void {
	gameDialog.value = { kind: 'new', mode };
}

export function openResign(): void {
	gameDialog.value = { kind: 'resign' };
}

export function openDrawOffer(): void {
	gameDialog.value = { kind: 'draw' };
}

export function closeGameDialog(): void {
	gameDialog.value = null;
}

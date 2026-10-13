// Global keyboard shortcuts (PLAN §4.1). Mounted once in AppShell.
//   ← / →        step back / forward        Home / End   start / end of line
//   Space        play / pause                F            flip board
//   Ctrl/⌘+S     save (command 'save')       Ctrl/⌘+⇧+S   save as (command 'saveAs')
//   /            focus search (command 'focusSearch')
// Ignored while typing in inputs/textareas/contenteditable, or when a modal
// dialog is open (except Escape handling, which belongs to the dialog).
import { useEffect } from 'preact/hooks';
import { commands } from '@/services/commands';
import { sessionsActions } from '@/state/sessions';
import { playbackActions } from '@/state/playback';

export interface ShortcutDef {
	/** e.g. 'ArrowLeft', 'mod+s', 'mod+shift+s', ' ', '/', 'f' */
	combo: string;
	label: string;
	run: () => void;
	/** Fire even when focus is in a text field (only for mod combos). */
	allowInInput?: boolean;
}

export const DEFAULT_SHORTCUTS: ShortcutDef[] = [
	{ combo: 'ArrowLeft', label: 'Previous move', run: () => sessionsActions.step(-1) },
	{ combo: 'ArrowRight', label: 'Next move', run: () => sessionsActions.step(1) },
	{ combo: 'Home', label: 'Start of line', run: () => sessionsActions.toStart() },
	{ combo: 'End', label: 'End of line', run: () => sessionsActions.toEnd() },
	{ combo: ' ', label: 'Play / pause', run: () => playbackActions.toggle() },
	{ combo: 'f', label: 'Flip board', run: () => sessionsActions.flip() },
	{ combo: 'mod+s', label: 'Save', run: () => commands.dispatch('save'), allowInInput: true },
	{ combo: 'mod+shift+s', label: 'Save as…', run: () => commands.dispatch('saveAs'), allowInInput: true },
	{ combo: '/', label: 'Search openings', run: () => commands.dispatch('focusSearch') },
];

export function comboFromEvent(e: KeyboardEvent): string {
	const parts: string[] = [];
	if (e.ctrlKey || e.metaKey) parts.push('mod');
	if (e.shiftKey && (e.ctrlKey || e.metaKey)) parts.push('shift');
	if (e.altKey) parts.push('alt');
	const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
	parts.push(key);
	return parts.join('+');
}

function isTextTarget(t: EventTarget | null): boolean {
	if (!(t instanceof HTMLElement)) return false;
	if (t.isContentEditable) return true;
	const tag = t.tagName;
	if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
	if (tag === 'INPUT') {
		const type = (t as HTMLInputElement).type;
		return !['checkbox', 'radio', 'button', 'range', 'color', 'submit'].includes(type);
	}
	return false;
}

function modalOpen(): boolean {
	return !!document.querySelector('[role="dialog"][aria-modal="true"]');
}

/** Elements that own arrow/space keys themselves (menus, tabs, sliders, the board's keyboard mode). */
function ownsKeys(t: EventTarget | null, key: string): boolean {
	if (!(t instanceof HTMLElement)) return false;
	if (key === ' ' && (t.tagName === 'BUTTON' || t.getAttribute('role') === 'button' || t.tagName === 'A')) return true;
	if (key.startsWith('Arrow') || key === 'Home' || key === 'End') {
		return !!t.closest('[role="tablist"], [role="menu"], [role="radiogroup"], [role="listbox"], [role="slider"], input[type="range"], [data-owns-keys]');
	}
	return false;
}

export function useKeyboardShortcuts(shortcuts: ShortcutDef[] = DEFAULT_SHORTCUTS): void {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.isComposing) return;
			const combo = comboFromEvent(e);
			const def = shortcuts.find((s) => s.combo === combo);
			if (!def) return;
			const inText = isTextTarget(e.target);
			if (inText && !def.allowInInput) return;
			if (modalOpen() && !def.combo.startsWith('mod+')) return;
			if (ownsKeys(e.target, e.key)) return;
			e.preventDefault();
			def.run();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [shortcuts]);
}

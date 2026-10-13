import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/preact';
import { getNode } from '@chess/core/chess';
import { commands } from '@/services/commands';
import { activeSession, resetSessionsState, sessionsActions } from '@/state/sessions';
import { freshRepositories } from '@/state/__tests__/testDb';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

function Host() {
	useKeyboardShortcuts();
	return <input data-testid="field" />;
}

const key = (k: string, extra: KeyboardEventInit = {}, target: EventTarget = window) =>
	target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

describe('useKeyboardShortcuts', () => {
	beforeEach(() => {
		resetSessionsState();
		freshRepositories();
		sessionsActions.newSession();
		['e2e4', 'e7e5'].forEach((m) => sessionsActions.move(m));
	});
	afterEach(() => resetSessionsState());

	it('arrows / Home / End navigate, F flips', () => {
		render(<Host />);
		key('ArrowLeft');
		expect(getNode(activeSession.value!.tree, activeSession.value!.cursor).san).toBe('e4');
		key('Home');
		expect(activeSession.value!.cursor).toBe('root');
		key('End');
		expect(getNode(activeSession.value!.tree, activeSession.value!.cursor).san).toBe('e5');
		key('f');
		expect(activeSession.value!.orientation).toBe('black');
	});

	it('Ctrl+S / Ctrl+Shift+S / "/" dispatch commands', () => {
		const seen: string[] = [];
		const off = commands.onDispatch((id) => seen.push(id));
		render(<Host />);
		key('s', { ctrlKey: true });
		key('S', { ctrlKey: true, shiftKey: true });
		key('/');
		off();
		expect(seen).toEqual(['save', 'saveAs', 'focusSearch']);
	});

	it('ignores plain keys while typing in a text field', () => {
		const { getByTestId } = render(<Host />);
		const spy = vi.spyOn(sessionsActions, 'flip');
		key('f', {}, getByTestId('field'));
		expect(spy).not.toHaveBeenCalled();
	});
});

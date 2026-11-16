import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { getUISetting, resetUISettings, setUISetting, UI_SETTING_DEFAULTS } from './uiSettings';
import { uiStorage } from './storage';
import { useUISetting } from '@/hooks/useUISetting';

function KeepSwitch() {
	const [keep, setKeep] = useUISetting('openings.keepPosition');
	return (
		<button type="button" onClick={() => setKeep(!keep)}>
			{keep ? 'on' : 'off'}
		</button>
	);
}

describe('uiSettings', () => {
	beforeEach(() => resetUISettings());

	it('reads defaults until changed, then the stored value', () => {
		expect(getUISetting('openings.keepPosition')).toBe(true);
		setUISetting('openings.keepPosition', false);
		expect(getUISetting('openings.keepPosition')).toBe(false);
		expect(uiStorage.get('openings.keepPosition')).toBe(false);
	});

	it("stats source defaults to 'lichess' and persists", () => {
		expect(UI_SETTING_DEFAULTS['openings.statsSource']).toBe('lichess');
		expect(getUISetting('openings.statsSource')).toBe('lichess');
		setUISetting('openings.statsSource', 'masters');
		expect(getUISetting('openings.statsSource')).toBe('masters');
		resetUISettings();
		expect(getUISetting('openings.statsSource')).toBe('lichess');
	});

	it('reset restores every default', () => {
		setUISetting('play.opponent', 'local');
		setUISetting('games.showFilters', true);
		resetUISettings();
		for (const key of Object.keys(UI_SETTING_DEFAULTS) as Array<keyof typeof UI_SETTING_DEFAULTS>) {
			expect(getUISetting(key)).toEqual(UI_SETTING_DEFAULTS[key]);
		}
	});

	it('useUISetting persists changes and follows a reset', () => {
		render(<KeepSwitch />);
		expect(screen.getByRole('button').textContent).toBe('on');
		fireEvent.click(screen.getByRole('button'));
		expect(screen.getByRole('button').textContent).toBe('off');
		expect(getUISetting('openings.keepPosition')).toBe(false);
		act(() => resetUISettings());
		expect(screen.getByRole('button').textContent).toBe('on');
	});
});

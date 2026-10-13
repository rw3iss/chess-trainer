// Settings persistence for the settings/clock/theme fields, and how themes
// resolve them (arrow colour, piece colour + depth overrides).
import { beforeEach, describe, expect, it } from 'vitest';
import { flushStores } from '@/state/registry';
import { DEFAULT_SETTINGS, loadSettings, replaceSetting, resetSettings, settings, updateSettings } from '@/state/settings';
import { activeBoardTheme, activePieceTheme, baseActivePieceTheme } from '@/state/themes';
import { freshRepositories, sleep } from './testDb';

describe('settings feature fields', () => {
	let repos: ReturnType<typeof freshRepositories>['repos'];
	beforeEach(() => {
		repos = freshRepositories().repos;
		resetSettings();
	});

	it('persists app / board / clock / piece settings and merges them over defaults on load', async () => {
		updateSettings({
			theme: { mode: 'light', accent: '#6f8fd1', density: 'compact', fontScale: 1.1 },
			animationScale: 1.5,
			motion: 'reduced',
			sounds: { enabled: false, volume: 0.3 },
			board: { arrowColor: '#2f6fd0', coordinates: 'outside' },
			clock: { presetId: 'custom', custom: { initialMs: 90 * 60_000, incrementMs: 30_000 }, delayMs: 2000, placement: 'side', size: 'L' },
			pieceDepthOverrides: { shading: 0.2 },
		});
		await flushStores();
		await sleep(20);
		const stored = await repos.settings.get<typeof DEFAULT_SETTINGS>('app');
		expect(stored?.clock).toMatchObject({ presetId: 'custom', delayMs: 2000, placement: 'side', size: 'L' });
		expect(stored?.animationScale).toBe(1.5);
		expect(stored?.pieceDepthOverrides).toEqual({ shading: 0.2 });
		resetSettings();
		await flushStores();
		// Simulate an older stored record missing the new fields.
		await repos.settings.set('app', { theme: { mode: 'light' }, clock: { placement: 'side' } });
		await loadSettings();
		expect(settings.value.theme.mode).toBe('light');
		expect(settings.value.clock.placement).toBe('side');
		expect(settings.value.clock.custom).toEqual(DEFAULT_SETTINGS.clock.custom);
		expect(settings.value.clock.delayMs).toBe(0);
		expect(settings.value.animationScale).toBe(1);
		expect(settings.value.board.arrowColor).toBe('');
		expect(settings.value.pieceDepthOverrides).toEqual({});
	});

	it('round-trips every new field through the repository', async () => {
		updateSettings({ animationScale: 0.6, board: { arrowColor: '#ffffff' }, clock: { delayMs: 3000, lowTimeMs: 5000 } });
		await flushStores();
		await sleep(20);
		await loadSettings();
		expect(settings.value.animationScale).toBe(0.6);
		expect(settings.value.board.arrowColor).toBe('#ffffff');
		expect(settings.value.clock).toMatchObject({ delayMs: 3000, lowTimeMs: 5000 });
	});

	it('arrow colour overrides the active board theme arrow', () => {
		const themeArrow = activeBoardTheme.value!.highlights.arrow;
		updateSettings({ board: { arrowColor: '#123456' } });
		expect(activeBoardTheme.value!.highlights.arrow).toBe('#123456');
		updateSettings({ board: { arrowColor: '' } });
		expect(activeBoardTheme.value!.highlights.arrow).toBe(themeArrow);
	});

	it('piece colour + depth overrides layer on the base piece theme; reset clears them', () => {
		const base = baseActivePieceTheme.value!;
		updateSettings({ pieceColorOverrides: { black: { body: '#101010' } }, pieceDepthOverrides: { shadow: 0 } });
		expect(activePieceTheme.value!.colors.black.body).toBe('#101010');
		expect(activePieceTheme.value!.colors.white).toEqual(base.colors.white);
		expect(activePieceTheme.value!.shadow).toBe(0);
		expect(activePieceTheme.value!.shading).toBe(base.shading);
		replaceSetting('pieceColorOverrides', {});
		replaceSetting('pieceDepthOverrides', {});
		expect(activePieceTheme.value).toBe(base);
	});
});

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { canInstall, initInstallState, installDismissed, isIosSafari, resetInstallDismissal } from '@/services/sw/install';
import { uiStorage } from '@/lib/storage';
import { InstallPrompt } from './InstallPrompt';

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted'): { prompt: ReturnType<typeof vi.fn> } {
	const prompt = vi.fn(() => Promise.resolve());
	const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
		platforms: ['web'],
		userChoice: Promise.resolve({ outcome, platform: 'web' }),
		prompt,
	});
	act(() => void window.dispatchEvent(e));
	return { prompt };
}

describe('InstallPrompt', () => {
	beforeAll(() => initInstallState());
	afterEach(() => {
		cleanup();
		resetInstallDismissal();
	});

	it('stays hidden until the browser offers an install', () => {
		render(<InstallPrompt />);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('shows on beforeinstallprompt and calls prompt() on Install', async () => {
		render(<InstallPrompt />);
		const { prompt } = fireBeforeInstallPrompt();
		expect(canInstall.value).toBe(true);
		expect(screen.getByText('Install Chess Openings')).toBeTruthy();
		await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^install$/i })));
		expect(prompt).toHaveBeenCalledOnce();
		expect(canInstall.value).toBe(false);
	});

	it('remembers dismissal in uiStorage', () => {
		render(<InstallPrompt />);
		fireBeforeInstallPrompt();
		act(() => void fireEvent.click(screen.getByRole('button', { name: 'Not now' })));
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(installDismissed.value).toBe(true);
		expect(uiStorage.get('pwa-install-dismissed')).toBe(true);
	});
});

describe('isIosSafari', () => {
	it('detects iPhone Safari but not iOS Chrome or desktop', () => {
		const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
		const crios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
		const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
		expect(isIosSafari(safari, 5)).toBe(true);
		expect(isIosSafari(crios, 5)).toBe(false);
		expect(isIosSafari(mac, 0)).toBe(false);
		expect(isIosSafari(mac, 5)).toBe(true); // iPadOS reports as Mac
	});
});

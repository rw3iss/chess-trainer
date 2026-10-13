// Small dismissible "Install Chess Trainer" card. Chromium: native prompt via promptInstall().
// iOS Safari: "Tap Share → Add to Home Screen" hint. Hidden when running standalone or after
// dismissal (remembered). State lives in services/sw/install.ts.
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { Button, Icon, IconButton, Portal } from '@/components/common';
import { dismissInstall, initInstallState, iosInstallHint, canInstall, promptInstall, showInstallPrompt } from '@/services/sw';
import './InstallPrompt.scss';

const APP_ICON = '/icons/icon-192.png';

export interface InstallPromptProps {
	/** Override the visible title (defaults to "Install Chess Trainer"). */
	title?: string;
}

export function InstallPrompt({ title = 'Install Chess Trainer' }: InstallPromptProps): JSX.Element | null {
	useEffect(initInstallState, []);
	if (!showInstallPrompt.value) return null;

	const native = canInstall.value;
	const ios = !native && iosInstallHint.value;

	return (
		<Portal>
			<aside class="install-prompt" role="dialog" aria-modal="false" aria-labelledby="install-prompt-title">
				<img class="install-prompt__icon" src={APP_ICON} alt="" width={44} height={44} />
				<div class="install-prompt__body">
					<h2 id="install-prompt-title" class="install-prompt__title">
						{title}
					</h2>
					{ios ? (
						<p class="install-prompt__text">
							Tap <Icon name="upload" size={15} class="install-prompt__glyph" title="Share" /> <strong>Share</strong>, then{' '}
							<strong>Add to Home Screen</strong>.
						</p>
					) : (
						<p class="install-prompt__text">Full screen, works offline, one tap from your home screen.</p>
					)}
					<div class="install-prompt__actions">
						{native && (
							<Button variant="primary" size="sm" icon="download" onClick={() => void promptInstall()}>
								Install
							</Button>
						)}
						<Button variant="ghost" size="sm" onClick={dismissInstall}>
							{ios ? 'Got it' : 'Not now'}
						</Button>
					</div>
				</div>
				<IconButton class="install-prompt__close" icon="close" label="Dismiss" size="sm" onClick={dismissInstall} />
			</aside>
		</Portal>
	);
}

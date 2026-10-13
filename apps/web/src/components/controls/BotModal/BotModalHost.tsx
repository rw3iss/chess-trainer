// Always-mounted host: owns the open state and handles the 'openBot' command.
import { signal } from '@preact/signals';
import type { JSX } from 'preact';
import { activeSession } from '@/state';
import { BotModal } from './BotModal';

export const botModalOpen = signal(false);

export function openBotModal(): void {
	botModalOpen.value = true;
}

export function BotModalHost(): JSX.Element {
	return <BotModal open={botModalOpen.value} onClose={() => (botModalOpen.value = false)} session={activeSession.value} />;
}

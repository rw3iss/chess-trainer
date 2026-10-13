// ShareLink — read-only room link with a copy button.
import type { JSX } from 'preact';
import { IconButton } from '@/components/common/IconButton';
import { copyToClipboard } from '@/components/controls/sessionCommands';
import { roomLink } from '@/services/realtime';
import './ShareLink.scss';

export function ShareLink({ roomId }: { roomId: string }): JSX.Element {
	const link = roomLink(roomId);
	return (
		<div class="share-link">
			<input class="share-link__input" readOnly value={link} aria-label="Room link" onFocus={(e) => e.currentTarget.select()} />
			<IconButton icon="copy" label="Copy link" variant="solid" size="sm" onClick={() => void copyToClipboard(link, 'Room link')} />
		</div>
	);
}

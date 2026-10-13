// Settings → Theme editor.
import type { JSX } from 'preact';
import { ThemeEditor } from '@/components/theme';
import { SectionHeader } from '../SettingsLayout';

export function ThemeEditorSection(): JSX.Element {
	return (
		<div class="settings-section">
			<SectionHeader title="Theme editor" description="Clone a board or piece theme, recolour it with a live preview, and save it as your own." />
			<ThemeEditor />
		</div>
	);
}

// Settings → Server: owned by the server feature (ServerSettingsSection).
import type { JSX } from 'preact';
import { LazySection, serverSectionLoader } from '../LazySection';
import { SectionHeader } from '../SettingsLayout';

export function ServerSection(): JSX.Element {
	return (
		<div class="settings-section">
			<SectionHeader title="Server" description="Optional: sign in, sync and play online. The app works fully offline without it." />
			<LazySection
				loader={serverSectionLoader}
				exportName="ServerSettingsSection"
				icon="server"
				fallbackTitle="Server settings unavailable"
				fallbackText="The server feature is not part of this build."
			/>
		</div>
	);
}

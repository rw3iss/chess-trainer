// Settings → Engines: owned by the engine feature (EngineSettingsSection).
import type { JSX } from 'preact';
import { LazySection, engineSectionLoader } from '../LazySection';
import { SectionHeader } from '../SettingsLayout';

export function EnginesSection(): JSX.Element {
	return (
		<div class="settings-section">
			<SectionHeader title="Engines" description="Analysis engine, bot defaults and think time." />
			<LazySection
				loader={engineSectionLoader}
				exportName="EngineSettingsSection"
				icon="bot"
				fallbackTitle="Engine settings unavailable"
				fallbackText="The engine feature is not part of this build."
			/>
		</div>
	);
}

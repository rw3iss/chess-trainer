// Root composition: router location + persistent AppShell + app-wide effects.
import type { JSX } from 'preact';
import { LocationProvider } from 'preact-iso';
import { AppShell } from '@/components/shell/AppShell';
import { useApplyAppearance } from '@/hooks/useTheme';
import { useServiceWorkerToasts } from '@/hooks/useServiceWorkerToasts';

export function App(): JSX.Element {
	useApplyAppearance();
	useServiceWorkerToasts();
	return (
		<LocationProvider>
			<AppShell />
		</LocationProvider>
	);
}

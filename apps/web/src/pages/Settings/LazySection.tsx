// Mount an optional feature's settings section from another feature folder.
// import.meta.glob keeps the dependency optional: if the module is missing the
// glob is empty and the fallback renders (no build error).
import { useEffect, useState } from 'preact/hooks';
import type { ComponentType, JSX } from 'preact';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';

type Loader = () => Promise<Record<string, unknown>>;

export interface LazySectionProps {
	loader: Loader | undefined;
	exportName: string;
	fallbackTitle: string;
	fallbackText: string;
	icon: 'bot' | 'server';
}

export function LazySection({ loader, exportName, fallbackTitle, fallbackText, icon }: LazySectionProps): JSX.Element {
	const [Comp, setComp] = useState<ComponentType | null>(null);
	const [failed, setFailed] = useState(!loader);

	useEffect(() => {
		if (!loader) return;
		let alive = true;
		loader().then(
			(m) => {
				const c = m[exportName] as ComponentType | undefined;
				if (!alive) return;
				if (c) setComp(() => c);
				else setFailed(true);
			},
			() => alive && setFailed(true),
		);
		return () => {
			alive = false;
		};
	}, [loader, exportName]);

	if (Comp) return <Comp />;
	if (failed) return <EmptyState icon={icon} title={fallbackTitle} description={fallbackText} compact />;
	return (
		<div class="settings-lazy">
			<Spinner size={18} />
		</div>
	);
}

const engineModules = import.meta.glob('../../components/engine/index.ts');
const serverModules = import.meta.glob('../../components/server/index.ts');

export const engineSectionLoader = engineModules['../../components/engine/index.ts'] as Loader | undefined;
export const serverSectionLoader = serverModules['../../components/server/index.ts'] as Loader | undefined;

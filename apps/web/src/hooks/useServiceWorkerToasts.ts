// Turns service-worker signals into toasts ("New version — Reload", "Ready to work offline").
import { useSignalEffect } from '@preact/signals';
import { applyServiceWorkerUpdate, swNeedRefresh, swOfflineReady } from '@/services/sw';
import { toast } from '@/services/toast';

export function useServiceWorkerToasts(): void {
	useSignalEffect(() => {
		if (!swNeedRefresh.value) return;
		toast.show({
			id: 'sw-update',
			kind: 'info',
			title: 'New version available',
			message: 'Reload to update the app.',
			durationMs: 0,
			action: { label: 'Reload', onClick: applyServiceWorkerUpdate },
		});
	});
	useSignalEffect(() => {
		if (!swOfflineReady.value) return;
		toast.success('Ready to work offline.', { id: 'sw-offline' });
		swOfflineReady.value = false;
	});
}

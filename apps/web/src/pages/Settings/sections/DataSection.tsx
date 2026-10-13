// Settings → Data: dataset version, storage usage, export / import all local
// data, clear caches, reset settings.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button, Modal } from '@/components/common';
import { downloadText, readFileText } from '@/components/theme';
import { dataCache } from '@/services/cache';
import { getRepositories } from '@/services/db';
import { toast } from '@/services/toast';
import { flushStores } from '@/state';
import { resetSettings, SETTINGS_KEY } from '@/state/settings';
import { SectionHeader, SettingsGroup, SettingsRow } from '../SettingsLayout';
import {
	buildBackup,
	clearRuntimeCaches,
	fetchDatasetManifest,
	formatBytes,
	parseBackup,
	restoreBackup,
	storageEstimate,
	type DatasetManifest,
	type StorageEstimate,
} from './dataTransfer';

export function DataSection(): JSX.Element {
	const [manifest, setManifest] = useState<DatasetManifest | null | undefined>(undefined);
	const [usage, setUsage] = useState<StorageEstimate | null | undefined>(undefined);
	const [busy, setBusy] = useState<string | null>(null);
	const [confirmReset, setConfirmReset] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	const refreshUsage = () => void storageEstimate().then(setUsage);
	useEffect(() => {
		void fetchDatasetManifest().then(setManifest);
		refreshUsage();
	}, []);

	const run = async (id: string, fn: () => Promise<void>) => {
		setBusy(id);
		try {
			await fn();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	};

	const exportAll = () =>
		run('export', async () => {
			await flushStores();
			const backup = await buildBackup(getRepositories(), SETTINGS_KEY);
			downloadText(`chess-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, '\t'));
			toast.success('Backup downloaded');
		});

	const onImport = (e: JSX.TargetedEvent<HTMLInputElement>) => {
		const file = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (!file) return;
		void run('import', async () => {
			const backup = parseBackup(await readFileText(file));
			await flushStores();
			const n = await restoreBackup(getRepositories(), backup, SETTINGS_KEY);
			toast.success(`Imported ${n} records — reloading…`, { id: 'import' });
			setTimeout(() => location.reload(), 900);
		});
	};

	const clearCaches = () =>
		run('caches', async () => {
			await dataCache.clear();
			const n = await clearRuntimeCaches();
			toast.success(`Cleared cached data${n ? ` (${n} cache${n === 1 ? '' : 's'})` : ''}`);
			refreshUsage();
		});

	const pct = usage && usage.quota ? Math.min(100, (usage.usage / usage.quota) * 100) : 0;

	return (
		<div class="settings-section">
			<SectionHeader title="Data" description="Everything is stored on this device. Back it up or move it to another one." />
			<SettingsGroup title="Openings dataset">
				<SettingsRow label="Version">
					<span class="settings-value">{manifest === undefined ? '…' : manifest ? `v${manifest.version}` : 'Unavailable'}</span>
				</SettingsRow>
				{manifest?.generatedAt && (
					<SettingsRow label="Built">
						<span class="settings-value">{new Date(manifest.generatedAt).toLocaleDateString()}</span>
					</SettingsRow>
				)}
				{manifest?.counts && (
					<SettingsRow label="Contents">
						<span class="settings-value">
							{Object.entries(manifest.counts)
								.filter(([k]) => k === 'openings' || k === 'positions' || k === 'notes')
								.map(([k, v]) => `${v.toLocaleString()} ${k}`)
								.join(' · ')}
						</span>
					</SettingsRow>
				)}
			</SettingsGroup>

			<SettingsGroup title="Storage">
				<SettingsRow label="Used on this device" hint={usage ? `of ${formatBytes(usage.quota)} available` : undefined}>
					<span class="settings-value">{usage === undefined ? '…' : usage ? formatBytes(usage.usage) : 'Unknown'}</span>
				</SettingsRow>
				{usage && (
					<div class="settings-meter" role="meter" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
						<span class="settings-meter__fill" style={{ width: `${Math.max(1, pct)}%` }} />
					</div>
				)}
				<SettingsRow label="Cached data" hint="Explorer results, fetched notes and images. Your games are not touched.">
					<Button size="sm" variant="secondary" icon="trash" loading={busy === 'caches'} onClick={() => void clearCaches()}>
						Clear caches
					</Button>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title="Backup">
				<SettingsRow label="Export everything" hint="Settings, open sessions, saved games, favourites, notes and custom themes.">
					<Button size="sm" variant="secondary" icon="download" loading={busy === 'export'} onClick={() => void exportAll()}>
						Export JSON
					</Button>
				</SettingsRow>
				<SettingsRow label="Import a backup" hint="Merges into your data, then reloads the app.">
					<Button size="sm" variant="secondary" icon="upload" loading={busy === 'import'} onClick={() => fileRef.current?.click()}>
						Import JSON
					</Button>
					<input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} aria-label="Import backup JSON" />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title="Reset">
				<SettingsRow label="Reset all settings" hint="Restores defaults. Games, sessions and themes are kept.">
					<Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>
						Reset settings
					</Button>
				</SettingsRow>
			</SettingsGroup>

			<Modal
				open={confirmReset}
				onClose={() => setConfirmReset(false)}
				title="Reset all settings?"
				description="Theme, board, clock, engine and server settings return to their defaults."
				size="sm"
				footer={
					<>
						<Button variant="ghost" onClick={() => setConfirmReset(false)}>
							Cancel
						</Button>
						<Button
							variant="danger"
							onClick={() => {
								resetSettings();
								setConfirmReset(false);
								toast.success('Settings reset');
							}}
						>
							Reset
						</Button>
					</>
				}
			/>
		</div>
	);
}

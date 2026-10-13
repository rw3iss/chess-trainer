// Settings → Engines (mounted lazily by the Settings page): default engine,
// analysis defaults, bot human delay, engine cards and a comparison table.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button, SegmentedControl, Select, Slider, Toggle } from '@/components/common';
import { toast } from '@/services/toast';
import {
	analysisActions,
	analysisPrefs,
	downloads,
	engineEntries,
	enginesActions,
	enginesLoaded,
	settings,
	updateSettings,
	MULTIPV_MAX,
} from '@/state';
import { EngineCard } from './EngineCard';
import './EngineSettingsSection.scss';

const MULTIPV_OPTIONS = Array.from({ length: MULTIPV_MAX }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

function ComparisonTable(): JSX.Element {
	const entries = engineEntries.value;
	return (
		<div class="engine-settings__table-wrap">
			<table class="engine-settings__table">
				<thead>
					<tr>
						<th scope="col">Engine</th>
						<th scope="col">Where</th>
						<th scope="col">Elo</th>
						<th scope="col">Size</th>
						<th scope="col">Human-like</th>
						<th scope="col">Status</th>
					</tr>
				</thead>
				<tbody>
					{entries.map(({ meta, availability }) => (
						<tr key={meta.id}>
							<th scope="row">{meta.name}</th>
							<td>{meta.kind === 'local' ? 'Local' : 'Server'}</td>
							<td class="engine-settings__num">
								{meta.eloRange[0]}–{meta.eloRange[1]}
							</td>
							<td class="engine-settings__num">{meta.sizeMb !== undefined ? `${meta.sizeMb} MB` : '–'}</td>
							<td>{meta.humanLike ? 'Yes' : '–'}</td>
							<td>{availability.available ? 'Available' : (availability.message ?? 'Unavailable')}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

async function importMaia(file: File | undefined): Promise<void> {
	if (!file) return;
	try {
		await enginesActions.importMaia(file);
		toast.success('Maia model imported');
	} catch (e) {
		toast.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
	}
}

export function EngineSettingsSection(): JSX.Element {
	const s = settings.value;
	const prefs = analysisPrefs.value;
	const entries = engineEntries.value;
	const dl = downloads.value;
	const [compare, setCompare] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		void enginesActions.refresh();
	}, []);

	const available = entries.filter((e) => e.availability.available);
	const defaultOptions = (available.length ? available : entries.filter((e) => e.meta.id === s.engine.defaultEngineId)).map((e) => ({ value: e.meta.id, label: e.meta.name }));
	const maia = entries.find((e) => e.meta.id === 'maia');


	return (
		<div class="engine-settings">
			<section class="engine-settings__group" aria-labelledby="engine-settings-defaults">
				<h3 class="engine-settings__heading" id="engine-settings-defaults">
					Defaults
				</h3>
				<div class="engine-settings__grid">
					{defaultOptions.length > 0 && (
						<Select label="Default engine" value={s.engine.defaultEngineId} options={defaultOptions} onChange={(id) => enginesActions.setDefault(id)} />
					)}
					<div class="engine-settings__field">
						<span class="engine-settings__label">Analysis lines (MultiPV)</span>
						<SegmentedControl size="sm" ariaLabel="Analysis lines" options={MULTIPV_OPTIONS} value={String(prefs.multiPv)} onChange={(v) => analysisActions.setMultiPv(Number(v))} />
					</div>
				</div>
				<Toggle checked={prefs.enabled} onChange={analysisActions.setEnabled} label="Analysis on" description="Run the engine on the current position (eval bar, arrows, lines)." />
				<Toggle checked={s.board.showEvalBar} onChange={(showEvalBar) => updateSettings({ board: { showEvalBar } })} label="Show evaluation bar" />
				<Toggle checked={s.board.showArrows} onChange={(showArrows) => updateSettings({ board: { showArrows } })} label="Show best-move arrows" />
				<Slider
					label="Bot human delay"
					min={0}
					max={2000}
					step={50}
					value={s.engine.humanDelayMs}
					onChange={(humanDelayMs) => updateSettings({ engine: { humanDelayMs } })}
					format={(v) => (v === 0 ? 'Off' : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 2)} s`)}
				/>
			</section>

			<section class="engine-settings__group" aria-labelledby="engine-settings-catalog">
				<div class="engine-settings__bar">
					<h3 class="engine-settings__heading" id="engine-settings-catalog">
						Engines
					</h3>
					<Toggle checked={compare} onChange={setCompare} label="Compare" class="engine-settings__compare" />
				</div>
				{!enginesLoaded.value && entries.length === 0 && <p class="engine-settings__note">Loading engines…</p>}
				{compare ? (
					<ComparisonTable />
				) : (
					<div class="engine-settings__cards">
						{entries.map((e) => (
							<EngineCard
								key={e.meta.id}
								entry={e}
								isDefault={s.engine.defaultEngineId === e.meta.id}
								progress={dl[e.meta.id]}
								onUse={enginesActions.setDefault}
								onDownload={(id) => void enginesActions.download(id)}
								onCancel={enginesActions.cancelDownload}
								onRemove={(id) => void enginesActions.remove(id)}
							/>
						))}
					</div>
				)}
				{maia && !maia.availability.available && (
					<p class="engine-settings__note">
						Maia download blocked?{' '}
						<Button size="sm" variant="ghost" icon="upload" onClick={() => fileRef.current?.click()}>
							Import a Maia-2 .onnx file
						</Button>
						<input ref={fileRef} type="file" accept=".onnx" hidden onChange={(e) => void importMaia((e.currentTarget as HTMLInputElement).files?.[0])} />
					</p>
				)}
			</section>
		</div>
	);
}

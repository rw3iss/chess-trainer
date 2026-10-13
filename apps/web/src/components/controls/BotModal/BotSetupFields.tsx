// Bot setup fields (engine, target Elo + presets, your colour, think time, clock, takebacks).
// Shared by the BotModal and the Play page. `useBotSetupForm` owns the form state and the
// fallback to an available engine; `BotSetupFields` only renders it.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { CLOCK_PRESETS } from '@chess/core/clock';
import type { Session } from '@chess/core/game';
import { Input, SegmentedControl, Select, Slider, Toggle } from '@/components/common';
import { engineEntries, enginesActions, enginesLoaded, settings } from '@/state';
import { cx } from '@/lib/classNames';
import {
	ELO_PRESETS,
	THINK_CHOICES,
	clampElo,
	initialForm,
	presetElo,
	presetEnabled,
	type BotFormState,
	type ThinkChoice,
	type UserColor,
} from './botForm';
import './BotModal.scss';

const COLOR_OPTIONS: { value: UserColor; label: string }[] = [
	{ value: 'white', label: 'White' },
	{ value: 'black', label: 'Black' },
	{ value: 'random', label: 'Random' },
];

const CLOCK_OPTIONS = CLOCK_PRESETS.map((p) => ({ value: p.id, label: p.label }));

export interface BotSetupForm {
	form: BotFormState;
	set: (patch: Partial<BotFormState>) => void;
	/** True when the selected engine can play now. */
	canStart: boolean;
}

/**
 * Form state for a bot game. Re-initialises whenever `resetKey` changes (e.g. a modal opening),
 * and falls back to the first available engine when the chosen one cannot play.
 */
export function useBotSetupForm(session: Session | null, active: boolean, resetKey: unknown = active): BotSetupForm {
	const entries = engineEntries.value;
	const metaOf = (id: string) => entries.find((e) => e.meta.id === id)?.meta;
	const defaults = settings.value.engine;
	const init = () => initialForm(session, { engineId: defaults.defaultEngineId, elo: defaults.defaultElo, think: defaults.think }, metaOf);
	const [form, setForm] = useState<BotFormState>(init);

	useEffect(() => {
		if (!active) return;
		setForm(init());
		if (!enginesLoaded.value) void enginesActions.refresh();
	}, [resetKey]);

	const available = entries.filter((e) => e.availability.available);
	const selected = entries.find((e) => e.meta.id === form.engineId);
	useEffect(() => {
		if (!active || !entries.length) return;
		if (!selected?.availability.available && available[0]) {
			const range = available[0].meta.eloRange;
			setForm((f) => ({ ...f, engineId: available[0]!.meta.id, elo: clampElo(f.elo, range) }));
		}
	}, [active, entries, form.engineId]);

	return {
		form,
		set: (patch) => setForm((f) => ({ ...f, ...patch })),
		canStart: !!selected?.availability.available,
	};
}

export interface BotSetupFieldsProps {
	form: BotFormState;
	set: (patch: Partial<BotFormState>) => void;
}

export function BotSetupFields({ form, set }: BotSetupFieldsProps): JSX.Element {
	const entries = engineEntries.value;
	const available = entries.filter((e) => e.availability.available);
	const unavailable = entries.filter((e) => !e.availability.available);
	const selected = entries.find((e) => e.meta.id === form.engineId);
	const range: [number, number] = selected?.meta.eloRange ?? [400, 3190];
	const engineOptions = useMemo(() => available.map((e) => ({ value: e.meta.id, label: `${e.meta.name}${e.meta.kind === 'remote' ? ' (server)' : ''}` })), [entries]);

	return (
		<div class="bot-modal__body">
			<section class="bot-modal__group">
				{engineOptions.length ? (
					<Select
						label="Engine"
						value={form.engineId}
						options={engineOptions}
						onChange={(id) => {
							const r = entries.find((e) => e.meta.id === id)?.meta.eloRange ?? range;
							set({ engineId: id, elo: clampElo(form.elo, r) });
						}}
					/>
				) : (
					<p class="bot-modal__note">{enginesLoaded.value ? 'No engine is available.' : 'Loading engines…'}</p>
				)}
				{selected && (
					<p class="bot-modal__note">
						{selected.meta.humanLike ? 'Human-like play. ' : ''}
						Strength {selected.meta.eloRange[0]}–{selected.meta.eloRange[1]}.
					</p>
				)}
				{unavailable.length > 0 && (
					<details class="bot-modal__unavailable">
						<summary>
							{unavailable.length} other engine{unavailable.length === 1 ? '' : 's'} not available
						</summary>
						<ul>
							{unavailable.map((e) => (
								<li key={e.meta.id}>
									<span class="bot-modal__unavail-name">{e.meta.name}</span>
									<span class="bot-modal__unavail-reason">{e.availability.message ?? 'Unavailable'}</span>
								</li>
							))}
						</ul>
					</details>
				)}
			</section>

			<section class="bot-modal__group">
				<Slider label="Target Elo" min={range[0]} max={range[1]} step={50} value={form.elo} onChange={(elo) => set({ elo })} format={(v) => String(v)} />
				<div class="bot-modal__presets" role="group" aria-label="Strength presets">
					{ELO_PRESETS.map((p) => {
						const elo = presetElo(p, range);
						const enabled = presetEnabled(p, range);
						return (
							<button
								key={p.id}
								type="button"
								class={cx('bot-modal__preset', enabled && form.elo === elo && 'bot-modal__preset--active')}
								disabled={!enabled}
								aria-pressed={enabled && form.elo === elo}
								title={enabled ? `${elo}` : `Outside ${selected?.meta.name ?? 'this engine'}'s range`}
								onClick={() => set({ elo })}
							>
								<span class="bot-modal__preset-label">{p.label}</span>
								<span class="bot-modal__preset-elo">{p.elo ?? elo}</span>
							</button>
						);
					})}
				</div>
			</section>

			<section class="bot-modal__group bot-modal__row">
				<div class="bot-modal__field">
					<span class="bot-modal__label">You play</span>
					<SegmentedControl ariaLabel="Your colour" options={COLOR_OPTIONS} value={form.userColor} onChange={(userColor) => set({ userColor })} />
				</div>
			</section>

			<section class="bot-modal__group">
				<div class="bot-modal__field">
					<span class="bot-modal__label">Think time</span>
					<SegmentedControl<ThinkChoice> ariaLabel="Think time" size="sm" options={THINK_CHOICES} value={form.think} onChange={(think) => set({ think })} />
				</div>
				{form.think === 'custom' && (
					<Input
						label="Milliseconds per move"
						type="number"
						min={20}
						max={60000}
						step={50}
						value={String(form.customMs)}
						onInput={(e) => set({ customMs: Number((e.currentTarget as HTMLInputElement).value) || 0 })}
						trailing={<span class="bot-modal__unit">ms</span>}
					/>
				)}
			</section>

			<section class="bot-modal__group">
				<Toggle checked={form.clockOn} onChange={(clockOn) => set({ clockOn })} label="Use a clock" description="Time control for both sides." />
				{form.clockOn && <Select label="Time control" value={form.clockPreset} options={CLOCK_OPTIONS} onChange={(clockPreset) => set({ clockPreset })} />}
				<Toggle checked={form.allowTakebacks} onChange={(allowTakebacks) => set({ allowTakebacks })} label="Allow takebacks" description="Undo your last move and the bot's reply." />
			</section>
		</div>
	);
}

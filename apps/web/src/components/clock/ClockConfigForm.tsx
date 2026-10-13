// ClockConfigForm — pick a time control: preset grid (grouped by speed) or
// custom minutes + increment, plus an optional simple delay. Controlled; used
// by Settings → Clock and the New game modal.
import type { JSX } from 'preact';
import { CLOCK_PRESETS } from '@chess/core/clock';
import { Chip } from '@/components/common/Chip';
import { Input } from '@/components/common/Input';
import type { ClockSettings } from '@/state/settings';
import { CUSTOM_PRESET_ID, clockCategory, describeClockConfig, resolveClockConfig } from './clockConfig';
import './ClockConfigForm.scss';

export type ClockConfigValue = Pick<ClockSettings, 'presetId' | 'custom' | 'delayMs'>;

export interface ClockConfigFormProps {
	value: ClockConfigValue;
	onChange: (next: ClockConfigValue) => void;
	/** Hide the delay field (compact contexts). */
	showDelay?: boolean;
	class?: string;
}

const MAX_MINUTES = 180;
const MAX_INCREMENT_S = 60;

function clampNum(raw: string, min: number, max: number, fallback: number): number {
	const n = Number(raw);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function ClockConfigForm({ value, onChange, showDelay = true, class: className }: ClockConfigFormProps): JSX.Element {
	const custom = value.presetId === CUSTOM_PRESET_ID || !CLOCK_PRESETS.some((p) => p.id === value.presetId);
	const resolved = resolveClockConfig(value);
	const set = (patch: Partial<ClockConfigValue>) => onChange({ ...value, ...patch });
	const setCustom = (patch: Partial<ClockConfigValue['custom']>) =>
		set({ presetId: CUSTOM_PRESET_ID, custom: { ...value.custom, ...patch } });

	return (
		<div class={`clock-form${className ? ` ${className}` : ''}`}>
			<div class="clock-form__presets" role="group" aria-label="Time control">
				{CLOCK_PRESETS.map((p) => (
					<Chip
						key={p.id}
						mono
						selected={!custom && value.presetId === p.id}
						title={clockCategory(p.config)}
						onClick={() => set({ presetId: p.id })}
						class="clock-form__preset"
					>
						{p.label}
					</Chip>
				))}
				<Chip selected={custom} icon="edit" onClick={() => set({ presetId: CUSTOM_PRESET_ID })} class="clock-form__preset">
					Custom
				</Chip>
			</div>
			{custom && (
				<div class="clock-form__custom">
					<Input
						label="Minutes"
						type="number"
						inputMode="decimal"
						min={0.25}
						max={MAX_MINUTES}
						step={0.25}
						value={String(value.custom.initialMs / 60_000)}
						onChange={(e) => setCustom({ initialMs: Math.round(clampNum((e.target as HTMLInputElement).value, 0.25, MAX_MINUTES, 10) * 60_000) })}
					/>
					<Input
						label="Increment (s)"
						type="number"
						inputMode="numeric"
						min={0}
						max={MAX_INCREMENT_S}
						value={String(value.custom.incrementMs / 1000)}
						onChange={(e) => setCustom({ incrementMs: Math.round(clampNum((e.target as HTMLInputElement).value, 0, MAX_INCREMENT_S, 0) * 1000) })}
					/>
				</div>
			)}
			{showDelay && (
				<div class="clock-form__custom">
					<Input
						label="Delay (s)"
						hint="Simple delay: the clock waits this long each move before counting down."
						type="number"
						inputMode="numeric"
						min={0}
						max={30}
						value={String(value.delayMs / 1000)}
						onChange={(e) => set({ delayMs: Math.round(clampNum((e.target as HTMLInputElement).value, 0, 30, 0) * 1000) })}
					/>
				</div>
			)}
			<p class="clock-form__summary">
				<span class="clock-form__summary-tc">{describeClockConfig(resolved)}</span>
				<span class="clock-form__summary-cat">{clockCategory(resolved)}</span>
			</p>
		</div>
	);
}

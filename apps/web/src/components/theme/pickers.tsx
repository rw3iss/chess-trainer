// Compact colour fields for the theme editor / piece overrides. Reuse the
// common ColorPicker (native picker + validated hex, no swatches) and Slider.
import type { JSX } from 'preact';
import { ColorPicker } from '@/components/common/ColorPicker';
import { Slider } from '@/components/common/Slider';
import { cx } from '@/lib/classNames';
import { formatCssColor, hexOf, parseCssColor } from './colorAlpha';
import './pickers.scss';

const NO_SWATCHES: string[] = [];

export interface ColorFieldProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	swatches?: string[];
	class?: string;
}

/** Label + native colour picker + hex input. */
export function ColorField({ label, value, onChange, swatches = NO_SWATCHES, class: className }: ColorFieldProps): JSX.Element {
	return (
		<div class={cx('color-field', className)}>
			<span class="color-field__label">{label}</span>
			<ColorPicker value={hexOf(value)} onChange={onChange} swatches={swatches} class="color-field__picker" />
		</div>
	);
}

/** Colour with opacity (rgba) — e.g. board highlights. */
export function AlphaColorField({ label, value, onChange, class: className }: ColorFieldProps): JSX.Element {
	const parsed = parseCssColor(value) ?? { hex: '#000000', alpha: 1 };
	return (
		<div class={cx('color-field', 'color-field--alpha', className)}>
			<span class="color-field__label">
				<span class="color-field__chip" style={{ background: value }} aria-hidden="true" />
				{label}
			</span>
			<ColorPicker value={parsed.hex} onChange={(hex) => onChange(formatCssColor(hex, parsed.alpha))} swatches={NO_SWATCHES} class="color-field__picker" />
			<Slider
				min={0}
				max={100}
				value={Math.round(parsed.alpha * 100)}
				onChange={(v) => onChange(formatCssColor(parsed.hex, v / 100))}
				format={(v) => `${v}%`}
				ariaLabel={`${label} opacity`}
				class="color-field__alpha"
			/>
		</div>
	);
}

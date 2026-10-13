import type { JSX } from 'preact';
import { useId } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import './Slider.scss';

export interface SliderProps {
	label?: string;
	min: number;
	max: number;
	step?: number;
	value: number;
	onChange: (v: number) => void;
	format?: (v: number) => string;
	/** Show the formatted value beside the label. Default true. */
	showValue?: boolean;
	disabled?: boolean;
	class?: string;
	ariaLabel?: string;
}

export function Slider({ label, min, max, step = 1, value, onChange, format, showValue = true, disabled, class: className, ariaLabel }: SliderProps): JSX.Element {
	const id = `sl-${useId()}`;
	const span = max - min;
	const pct = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0;
	const text = format ? format(value) : String(value);
	return (
		<div class={cx('slider', { 'slider--disabled': !!disabled }, className)}>
			{(label || showValue) && (
				<div class="slider__head">
					{label && (
						<label class="slider__label" for={id}>
							{label}
						</label>
					)}
					{showValue && (
						<output class="slider__value" for={id}>
							{text}
						</output>
					)}
				</div>
			)}
			<input
				id={id}
				class="slider__input"
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				disabled={disabled}
				aria-label={label ? undefined : ariaLabel}
				aria-valuetext={format ? text : undefined}
				style={{ '--fill': `${pct}%` }}
				onInput={(e) => onChange(Number(e.currentTarget.value))}
			/>
		</div>
	);
}

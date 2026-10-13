import type { JSX } from 'preact';
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { normalizeHex, readableOn } from '@/lib/color';
import { throttle } from '@/lib/throttle';
import { Icon } from '../Icon';
import { nextRovingIndex } from '../Tabs/rovingKeys';
import './ColorPicker.scss';

/** Default accent-friendly swatches (brass first). */
export const DEFAULT_SWATCHES = ['#c9a45c', '#d08a4f', '#c46a5a', '#b56a8f', '#8a7cc9', '#6f8fd1', '#5aa3b5', '#6fbf8a', '#a3b05a', '#9c968b'];

export interface ColorPickerProps {
	/** Hex colour (#rgb or #rrggbb). */
	value: string;
	onChange: (hex: string) => void;
	label?: string;
	swatches?: string[];
	/** Show native picker + hex field. Default true. */
	allowCustom?: boolean;
	class?: string;
}

export function ColorPicker({ value, onChange, label, swatches = DEFAULT_SWATCHES, allowCustom = true, class: className }: ColorPickerProps): JSX.Element {
	const id = `cp-${useId()}`;
	const current = normalizeHex(value) ?? '#000000';
	const list = useMemo(() => swatches.map((s) => normalizeHex(s)).filter((s): s is string => !!s), [swatches]);
	const [text, setText] = useState(current);
	const [invalid, setInvalid] = useState(false);
	const editing = useRef(false);
	const groupRef = useRef<HTMLDivElement>(null);

	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const throttled = useMemo(() => throttle((hex: string) => onChangeRef.current(hex)), []);
	useEffect(() => () => throttled.cancel(), [throttled]);

	// Sync the text field when the value changes from outside.
	useEffect(() => {
		if (!editing.current) {
			setText(current);
			setInvalid(false);
		}
	}, [current]);

	const selectedIndex = list.indexOf(current);

	const onSwatchKey = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
		const next = nextRovingIndex(e.key, Math.max(0, selectedIndex), list.length, 'both');
		if (next === null) return;
		e.preventDefault();
		onChange(list[next]);
		groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
	};

	const onText = (raw: string) => {
		const withHash = raw.startsWith('#') ? raw : `#${raw}`;
		setText(raw);
		const hex = normalizeHex(withHash);
		setInvalid(!hex && raw.trim() !== '');
		if (hex) throttled(hex);
	};

	return (
		<div class={cx('color-picker', className)}>
			{label && (
				<span class="color-picker__label" id={`${id}-label`}>
					{label}
				</span>
			)}
			<div ref={groupRef} class="color-picker__swatches" role="radiogroup" aria-labelledby={label ? `${id}-label` : undefined} aria-label={label ? undefined : 'Colour'} onKeyDown={onSwatchKey}>
				{list.map((hex, i) => {
					const checked = hex === current;
					return (
						<button
							key={hex}
							type="button"
							role="radio"
							aria-checked={checked}
							aria-label={hex}
							title={hex}
							tabIndex={checked || (selectedIndex < 0 && i === 0) ? 0 : -1}
							class={cx('color-picker__swatch', { 'color-picker__swatch--active': checked })}
							style={{ '--swatch': hex, color: readableOn(hex) }}
							onClick={() => onChange(hex)}
						>
							{checked && <Icon name="check" size={14} strokeWidth={2.5} />}
						</button>
					);
				})}
			</div>
			{allowCustom && (
				<div class="color-picker__custom">
					<label class="color-picker__native" style={{ '--swatch': current }} title="Custom colour">
						<input type="color" value={current} aria-label="Custom colour" onInput={(e) => throttled(e.currentTarget.value.toLowerCase())} />
					</label>
					<div class={cx('color-picker__hex', { 'color-picker__hex--invalid': invalid })}>
						<input
							type="text"
							inputMode="text"
							spellcheck={false}
							autoComplete="off"
							maxLength={7}
							value={text}
							aria-label="Hex colour"
							aria-invalid={invalid || undefined}
							onFocus={() => {
								editing.current = true;
							}}
							onBlur={() => {
								editing.current = false;
								throttled.cancel();
								const hex = normalizeHex(text.startsWith('#') ? text : `#${text}`);
								if (hex && hex !== current) onChange(hex);
								setText(hex ?? current);
								setInvalid(false);
							}}
							onKeyDown={(e) => {
								if (e.key === 'Enter') e.currentTarget.blur();
							}}
							onInput={(e) => onText(e.currentTarget.value)}
						/>
					</div>
				</div>
			)}
		</div>
	);
}

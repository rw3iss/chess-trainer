import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { Icon, type IconName } from '../Icon';
import { nextRovingIndex } from '../Tabs/rovingKeys';
import { useIndicator } from '../Tabs/useIndicator';
import './SegmentedControl.scss';

export interface SegmentOption<T extends string> {
	value: T;
	label?: string;
	icon?: IconName;
	/** Tooltip / accessible name for icon-only segments. */
	title?: string;
}

export interface SegmentedControlProps<T extends string> {
	options: SegmentOption<T>[];
	value: T;
	onChange: (v: T) => void;
	size?: 'sm' | 'md';
	ariaLabel?: string;
	class?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, size = 'md', ariaLabel, class: className }: SegmentedControlProps<T>): JSX.Element {
	const ref = useRef<HTMLDivElement>(null);
	const indicator = useIndicator(ref, '[aria-checked="true"]', [value, options.length, size]);

	const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
		const current = Math.max(0, options.findIndex((o) => o.value === value));
		const next = nextRovingIndex(e.key, current, options.length, 'both');
		if (next === null) return;
		e.preventDefault();
		onChange(options[next].value);
		ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
	};

	return (
		<div ref={ref} role="radiogroup" aria-label={ariaLabel} class={cx('segmented', `segmented--${size}`, className)} onKeyDown={onKeyDown}>
			<span
				class={cx('segmented__thumb', { 'segmented__thumb--ready': indicator.ready })}
				aria-hidden="true"
				style={{ width: `${indicator.width}px`, transform: `translateX(${indicator.left}px)` }}
			/>
			{options.map((o) => {
				const checked = o.value === value;
				return (
					<button
						key={o.value}
						type="button"
						role="radio"
						aria-checked={checked}
						aria-label={o.label ? undefined : (o.title ?? o.value)}
						title={o.title}
						tabIndex={checked ? 0 : -1}
						class={cx('segmented__option', { 'segmented__option--active': checked, 'segmented__option--icon-only': !o.label })}
						onClick={() => onChange(o.value)}
					>
						{o.icon && <Icon name={o.icon} size={size === 'sm' ? 16 : 18} />}
						{o.label && <span class="segmented__label">{o.label}</span>}
					</button>
				);
			})}
		</div>
	);
}

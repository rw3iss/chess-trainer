import type { JSX } from 'preact';
import { useId } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { Icon } from '../Icon';
import './Select.scss';

export interface SelectOption<T extends string> {
	value: T;
	label: string;
}

export interface SelectProps<T extends string> {
	label?: string;
	value: T;
	options: SelectOption<T>[];
	onChange: (v: T) => void;
	disabled?: boolean;
	class?: string;
	id?: string;
	ariaLabel?: string;
}

export function Select<T extends string>({ label, value, options, onChange, disabled, class: className, id: idProp, ariaLabel }: SelectProps<T>): JSX.Element {
	const autoId = useId();
	const id = idProp ?? `sel-${autoId}`;
	return (
		<div class={cx('select', { 'select--disabled': !!disabled }, className)}>
			{label && (
				<label class="select__label" for={id}>
					{label}
				</label>
			)}
			<div class="select__control">
				<select
					id={id}
					class="select__native"
					value={value}
					disabled={disabled}
					aria-label={label ? undefined : ariaLabel}
					onChange={(e) => onChange(e.currentTarget.value as T)}
				>
					{options.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
				<Icon name="chevron-down" size={16} class="select__chevron" />
			</div>
		</div>
	);
}

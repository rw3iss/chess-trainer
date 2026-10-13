import type { JSX } from 'preact';
import { useId } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import './Toggle.scss';

export interface ToggleProps {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: string;
	description?: string;
	disabled?: boolean;
	class?: string;
}

export function Toggle({ checked, onChange, label, description, disabled, class: className }: ToggleProps): JSX.Element {
	const id = useId();
	const labelId = `tg-${id}-l`;
	const descId = `tg-${id}-d`;
	return (
		<label class={cx('toggle', { 'toggle--on': checked, 'toggle--disabled': !!disabled }, className)}>
			<span class="toggle__text">
				<span class="toggle__label" id={labelId}>
					{label}
				</span>
				{description && (
					<span class="toggle__description" id={descId}>
						{description}
					</span>
				)}
			</span>
			<button
				type="button"
				role="switch"
				class="toggle__switch"
				aria-checked={checked}
				aria-labelledby={labelId}
				aria-describedby={description ? descId : undefined}
				disabled={disabled}
				onClick={() => {
					if (!disabled) onChange(!checked);
				}}
			>
				<span class="toggle__thumb" />
			</button>
		</label>
	);
}

import type { JSX } from 'preact';
import { cx } from '@/lib/classNames';
import './Spinner.scss';

export interface SpinnerProps {
	/** Pixel size. Default 20. */
	size?: number;
	/** Screen-reader label. Default 'Loading'. */
	label?: string;
	class?: string;
}

export function Spinner({ size = 20, label = 'Loading', class: className }: SpinnerProps): JSX.Element {
	return (
		<span class={cx('spinner', className)} role="status" style={{ width: `${size}px`, height: `${size}px` }}>
			<svg class="spinner__svg" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
				<circle class="spinner__track" cx="12" cy="12" r="9.5" fill="none" stroke-width="2.25" />
				<circle class="spinner__arc" cx="12" cy="12" r="9.5" fill="none" stroke-width="2.25" stroke-linecap="round" />
			</svg>
			<span class="spinner__label">{label}</span>
		</span>
	);
}

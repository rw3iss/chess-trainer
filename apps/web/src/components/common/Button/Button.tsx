import type { ButtonHTMLAttributes, ComponentChildren, JSX } from 'preact';
import { forwardRef } from 'preact/compat';
import { cx } from '@/lib/classNames';
import { Icon, type IconName } from '../Icon';
import { Spinner } from '../Spinner';
import './Button.scss';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'icon' | 'size' | 'loading' | 'ref'> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	icon?: IconName;
	iconRight?: IconName;
	loading?: boolean;
	block?: boolean;
	children?: ComponentChildren;
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ variant = 'secondary', size = 'md', icon, iconRight, loading = false, block = false, type = 'button', class: className, className: className2, disabled, children, ...rest },
	ref,
): JSX.Element {
	const iconSize = ICON_SIZE[size];
	return (
		<button
			{...rest}
			ref={ref}
			type={type}
			class={cx('btn', `btn--${variant}`, `btn--${size}`, { 'btn--block': block, 'btn--loading': loading, 'btn--icon-only': !children }, className as string, className2 as string)}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
		>
			{loading ? (
				<Spinner size={iconSize} class="btn__icon" label="Working" />
			) : (
				icon && <Icon name={icon} size={iconSize} class="btn__icon" />
			)}
			{children != null && children !== false && <span class="btn__label">{children}</span>}
			{iconRight && <Icon name={iconRight} size={iconSize} class="btn__icon btn__icon--right" />}
		</button>
	);
});

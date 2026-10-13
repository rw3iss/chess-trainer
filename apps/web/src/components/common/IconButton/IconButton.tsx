import type { ButtonHTMLAttributes, JSX } from 'preact';
import { forwardRef } from 'preact/compat';
import { cx } from '@/lib/classNames';
import { Icon, type IconName } from '../Icon';
import './IconButton.scss';

export type IconButtonVariant = 'ghost' | 'solid' | 'accent';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'icon' | 'size' | 'label' | 'ref' | 'children'> {
	icon: IconName;
	/** Accessible name; also the native hover title. */
	label: string;
	variant?: IconButtonVariant;
	size?: IconButtonSize;
	/** Toggle state → aria-pressed + accent tint. */
	active?: boolean;
	badge?: string | number;
}

const ICON_SIZE: Record<IconButtonSize, number> = { sm: 16, md: 20, lg: 22 };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
	{ icon, label, variant = 'ghost', size = 'md', active, badge, type = 'button', class: className, className: className2, title, ...rest },
	ref,
): JSX.Element {
	return (
		<button
			{...rest}
			ref={ref}
			type={type}
			class={cx('icon-btn', `icon-btn--${variant}`, `icon-btn--${size}`, { 'icon-btn--active': !!active }, className as string, className2 as string)}
			aria-label={label}
			title={(title as string | undefined) ?? label}
			aria-pressed={active === undefined ? undefined : active}
		>
			<Icon name={icon} size={ICON_SIZE[size]} />
			{badge !== undefined && badge !== '' && (
				<span class="icon-btn__badge" aria-hidden="true">
					{badge}
				</span>
			)}
		</button>
	);
});

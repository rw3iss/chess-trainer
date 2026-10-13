import type { JSX } from 'preact';
import { useId } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { ICONS, type IconName } from './icons';
import './Icon.scss';

export interface IconProps {
	name: IconName;
	/** Pixel size (width = height). Default 20. */
	size?: number;
	class?: string;
	/** Accessible title. Without it the icon is decorative (aria-hidden). */
	title?: string;
	strokeWidth?: number;
}

export function Icon({ name, size = 20, class: className, title, strokeWidth = 1.75 }: IconProps): JSX.Element {
	const titleId = useId();
	const draw = ICONS[name] ?? ICONS.info;
	return (
		<svg
			class={cx('icon', `icon--${name}`, className)}
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width={strokeWidth}
			stroke-linecap="round"
			stroke-linejoin="round"
			focusable="false"
			role={title ? 'img' : undefined}
			aria-hidden={title ? undefined : 'true'}
			aria-labelledby={title ? titleId : undefined}
		>
			{title && <title id={titleId}>{title}</title>}
			{draw()}
		</svg>
	);
}

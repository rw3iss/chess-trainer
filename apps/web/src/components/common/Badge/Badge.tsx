import type { ComponentChildren, JSX } from 'preact';
import { cx } from '@/lib/classNames';
import './Badge.scss';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'info';

export interface BadgeProps {
	tone?: BadgeTone;
	/** Render only an 8px status dot (children become its sr-only label). */
	dot?: boolean;
	class?: string;
	title?: string;
	children?: ComponentChildren;
}

export function Badge({ tone = 'neutral', dot, class: className, title, children }: BadgeProps): JSX.Element {
	if (dot)
		return (
			<span class={cx('badge-dot', `badge-dot--${tone}`, className)} title={title} role={children ? 'img' : undefined} aria-label={typeof children === 'string' ? children : undefined} aria-hidden={children ? undefined : 'true'} />
		);
	return (
		<span class={cx('badge', `badge--${tone}`, className)} title={title}>
			{children}
		</span>
	);
}

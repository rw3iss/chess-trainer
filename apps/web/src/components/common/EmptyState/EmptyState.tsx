import type { ComponentChildren, JSX } from 'preact';
import { cx } from '@/lib/classNames';
import { Icon, type IconName } from '../Icon';
import './EmptyState.scss';

export interface EmptyStateProps {
	icon?: IconName;
	title: string;
	description?: ComponentChildren;
	class?: string;
	compact?: boolean;
	/** Actions (buttons). */
	children?: ComponentChildren;
}

export function EmptyState({ icon, title, description, class: className, compact, children }: EmptyStateProps): JSX.Element {
	return (
		<div class={cx('empty-state', { 'empty-state--compact': !!compact }, className)}>
			{icon && (
				<span class="empty-state__icon" aria-hidden="true">
					<Icon name={icon} size={compact ? 20 : 26} strokeWidth={1.5} />
				</span>
			)}
			<h3 class="empty-state__title">{title}</h3>
			{description && <div class="empty-state__description">{description}</div>}
			{children && <div class="empty-state__actions">{children}</div>}
		</div>
	);
}

import type { ComponentChildren, JSX } from 'preact';
import { cx } from '@/lib/classNames';
import { Icon, type IconName } from '../Icon';
import './Chip.scss';

export interface ChipProps {
	label?: string;
	children?: ComponentChildren;
	selected?: boolean;
	onClick?: (e: MouseEvent) => void;
	onRemove?: () => void;
	icon?: IconName;
	tone?: 'neutral' | 'accent';
	size?: 'sm' | 'md';
	/** Monospace text (ECO codes, move strings). */
	mono?: boolean;
	title?: string;
	class?: string;
	disabled?: boolean;
}

export function Chip({ label, children, selected, onClick, onRemove, icon, tone = 'neutral', size = 'md', mono, title, class: className, disabled }: ChipProps): JSX.Element {
	const text = children ?? label;
	const classes = cx('chip', `chip--${tone}`, `chip--${size}`, {
		'chip--selected': !!selected,
		'chip--mono': !!mono,
		'chip--interactive': !!onClick,
		'chip--removable': !!onRemove,
	}, className);
	const inner = (
		<>
			{icon && <Icon name={icon} size={size === 'sm' ? 12 : 14} class="chip__icon" />}
			<span class="chip__label">{text}</span>
		</>
	);
	const remove = onRemove && (
		<button
			type="button"
			class="chip__remove"
			aria-label={`Remove ${label ?? (typeof text === 'string' ? text : '')}`.trim()}
			disabled={disabled}
			onClick={(e) => {
				e.stopPropagation();
				onRemove();
			}}
		>
			<Icon name="close" size={size === 'sm' ? 12 : 14} />
		</button>
	);

	if (onClick && !onRemove)
		return (
			<button type="button" class={classes} title={title} aria-pressed={selected === undefined ? undefined : selected} disabled={disabled} onClick={(e) => onClick(e)}>
				<span class="chip__main">{inner}</span>
			</button>
		);

	if (onClick) {
		// A remove button cannot nest inside a <button>, so wrap both in a span.
		return (
			<span class={classes}>
				<button type="button" class="chip__main" title={title} aria-pressed={selected === undefined ? undefined : selected} disabled={disabled} onClick={(e) => onClick(e)}>
					{inner}
				</button>
				{remove}
			</span>
		);
	}
	return (
		<span class={classes} title={title}>
			<span class="chip__main">{inner}</span>
			{remove}
		</span>
	);
}

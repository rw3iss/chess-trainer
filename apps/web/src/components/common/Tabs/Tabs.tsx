import type { JSX } from 'preact';
import { useId, useRef } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { Icon, type IconName } from '../Icon';
import { nextRovingIndex } from './rovingKeys';
import { useIndicator } from './useIndicator';
import './Tabs.scss';

export interface TabItem<T extends string> {
	id: T;
	label: string;
	icon?: IconName;
	badge?: string | number;
}

export interface TabsProps<T extends string> {
	items: TabItem<T>[];
	value: T;
	onChange: (id: T) => void;
	variant?: 'underline' | 'pill';
	size?: 'sm' | 'md';
	class?: string;
	ariaLabel?: string;
}

/** Stable id for a tab button, so callers can wire aria-labelledby on panels. */
export function tabDomId(base: string, id: string): string {
	return `${base}-tab-${id}`;
}

export function Tabs<T extends string>({ items, value, onChange, variant = 'underline', size = 'md', class: className, ariaLabel }: TabsProps<T>): JSX.Element {
	const base = `tabs-${useId()}`;
	const listRef = useRef<HTMLDivElement>(null);
	const indicator = useIndicator(listRef, '[aria-selected="true"]', [value, items.length, variant, size]);

	const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
		const current = Math.max(0, items.findIndex((t) => t.id === value));
		const next = nextRovingIndex(e.key, current, items.length);
		if (next === null) return;
		e.preventDefault();
		const item = items[next];
		onChange(item.id);
		document.getElementById(tabDomId(base, item.id))?.focus();
	};

	return (
		<div
			ref={listRef}
			role="tablist"
			aria-label={ariaLabel}
			aria-orientation="horizontal"
			class={cx('tabs', `tabs--${variant}`, `tabs--${size}`, className)}
			onKeyDown={onKeyDown}
		>
			{items.map((t) => {
				const selected = t.id === value;
				return (
					<button
						key={t.id}
						id={tabDomId(base, t.id)}
						type="button"
						role="tab"
						class={cx('tabs__tab', { 'tabs__tab--active': selected })}
						aria-selected={selected}
						tabIndex={selected ? 0 : -1}
						onClick={() => onChange(t.id)}
					>
						{t.icon && <Icon name={t.icon} size={size === 'sm' ? 16 : 18} class="tabs__icon" />}
						<span class="tabs__label">{t.label}</span>
						{t.badge !== undefined && t.badge !== '' && <span class="tabs__badge">{t.badge}</span>}
					</button>
				);
			})}
			<span
				class={cx('tabs__indicator', { 'tabs__indicator--ready': indicator.ready })}
				aria-hidden="true"
				style={{ width: `${indicator.width}px`, transform: `translateX(${indicator.left}px)` }}
			/>
		</div>
	);
}

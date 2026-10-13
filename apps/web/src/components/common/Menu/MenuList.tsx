// The list renderer shared by Menu and ContextMenu: role=menu, arrow-key
// roving focus, Enter/Space select (native button), Esc/Tab close.

import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { Icon } from '../Icon';
import { isActionItem, type MenuCloseReason, type MenuItem } from './types';
import './Menu.scss';

export interface MenuListProps {
	items: MenuItem[];
	onClose: (reason?: MenuCloseReason) => void;
	/** Focus the first enabled item on mount. Default true. */
	autoFocus?: boolean;
	class?: string;
	ariaLabel?: string;
	id?: string;
	labelledBy?: string;
}

const ITEM_SELECTOR = '[role^="menuitem"]:not([aria-disabled="true"])';

export function MenuList({ items, onClose, autoFocus = true, class: className, ariaLabel, id, labelledBy }: MenuListProps): JSX.Element {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!autoFocus) return;
		ref.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus({ preventScroll: true });
	}, [autoFocus]);

	const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
		const list = ref.current;
		if (!list) return;
		const nodes = Array.from(list.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
		const index = nodes.indexOf(document.activeElement as HTMLElement);
		let next: number | null = null;
		switch (e.key) {
			case 'ArrowDown':
				next = index < 0 ? 0 : (index + 1) % nodes.length;
				break;
			case 'ArrowUp':
				next = index < 0 ? nodes.length - 1 : (index - 1 + nodes.length) % nodes.length;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = nodes.length - 1;
				break;
			case 'Escape':
				e.preventDefault();
				e.stopPropagation();
				onClose('escape');
				return;
			case 'Tab':
				onClose('tab');
				return;
			default: {
				// Typeahead: jump to the next item starting with the typed letter.
				if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
					const ch = e.key.toLowerCase();
					const order = [...nodes.slice(index + 1), ...nodes.slice(0, index + 1)];
					const hit = order.find((n) => (n.textContent ?? '').trim().toLowerCase().startsWith(ch));
					if (hit) {
						e.preventDefault();
						hit.focus();
					}
				}
				return;
			}
		}
		if (next !== null && nodes[next]) {
			e.preventDefault();
			nodes[next].focus();
		}
	};

	return (
		<div ref={ref} id={id} role="menu" aria-label={ariaLabel} aria-labelledby={labelledBy} class={cx('menu-list', className)} onKeyDown={onKeyDown}>
			{items.map((item, i) => {
				if ('separator' in item) return <div key={`sep-${i}`} role="separator" class="menu-list__separator" />;
				if ('heading' in item)
					return (
						<div key={`h-${i}`} role="presentation" class="menu-list__heading">
							{item.heading}
						</div>
					);
				if (!isActionItem(item)) return null;
				const checkable = item.checked !== undefined;
				return (
					<button
						key={item.id}
						type="button"
						role={checkable ? 'menuitemcheckbox' : 'menuitem'}
						aria-checked={checkable ? !!item.checked : undefined}
						aria-disabled={item.disabled || undefined}
						tabIndex={-1}
						class={cx('menu-list__item', { 'menu-list__item--danger': !!item.danger, 'menu-list__item--disabled': !!item.disabled })}
						onClick={() => {
							if (item.disabled) return;
							onClose('select');
							item.onSelect();
						}}
						onPointerMove={(e) => {
							if (!item.disabled && document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true });
						}}
					>
						<span class="menu-list__lead" aria-hidden="true">
							{checkable ? item.checked && <Icon name="check" size={16} /> : item.icon && <Icon name={item.icon} size={16} />}
						</span>
						<span class="menu-list__label">{item.label}</span>
						{item.shortcut && <kbd class="menu-list__shortcut">{item.shortcut}</kbd>}
					</button>
				);
			})}
		</div>
	);
}

import type { ComponentChildren, JSX, Ref, VNode } from 'preact';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Portal, useOverlayLayer } from '../Portal';
import { MenuList } from './MenuList';
import { placePopover } from './position';
import type { MenuCloseReason, MenuItem } from './types';
import './Menu.scss';

export interface MenuTriggerProps {
	ref: Ref<HTMLButtonElement>;
	onClick: (e: MouseEvent) => void;
	'aria-haspopup': 'menu';
	'aria-expanded': boolean;
	'aria-controls'?: string;
}

export interface MenuProps {
	items: MenuItem[];
	trigger: (props: MenuTriggerProps) => VNode;
	align?: 'start' | 'end';
	/** Preferred side; flips when there is no room. Default 'bottom'. */
	placement?: 'bottom' | 'top';
	class?: string;
	minWidth?: number;
	header?: ComponentChildren;
	footer?: ComponentChildren;
	ariaLabel?: string;
}

export function Menu({ items, trigger, align = 'start', placement = 'bottom', class: className, minWidth = 200, header, footer, ariaLabel }: MenuProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState<{ top: number; left: number; placement: 'bottom' | 'top' } | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const popRef = useRef<HTMLDivElement>(null);
	const menuId = `menu-${useId()}`;

	const close = useCallback((reason?: MenuCloseReason) => {
		setOpen(false);
		setPos(null);
		if (reason === 'escape' || reason === 'select') triggerRef.current?.focus({ preventScroll: true });
	}, []);

	const reposition = useCallback(() => {
		const t = triggerRef.current;
		const p = popRef.current;
		if (!t || !p) return;
		const r = t.getBoundingClientRect();
		setPos(placePopover(r, { width: p.offsetWidth, height: p.offsetHeight }, { align, placement }));
	}, [align, placement]);

	useLayoutEffect(() => {
		if (open) reposition();
	}, [open, reposition, items.length]);

	useEffect(() => {
		if (!open) return;
		const onMove = () => reposition();
		window.addEventListener('resize', onMove);
		window.addEventListener('scroll', onMove, true);
		return () => {
			window.removeEventListener('resize', onMove);
			window.removeEventListener('scroll', onMove, true);
		};
	}, [open, reposition]);

	useClickOutside([popRef, triggerRef], () => close('outside'), open);
	useOverlayLayer(open, () => close('escape'));

	const onTriggerClick = (e: MouseEvent) => {
		e.preventDefault();
		setOpen((o) => !o);
	};

	return (
		<>
			{trigger({
				ref: triggerRef,
				onClick: onTriggerClick,
				'aria-haspopup': 'menu',
				'aria-expanded': open,
				'aria-controls': open ? menuId : undefined,
			})}
			{open && (
				<Portal>
					<div
						ref={popRef}
						class={cx('menu', pos && `menu--${pos.placement}`, className)}
						style={{
							top: pos ? `${pos.top}px` : '0px',
							left: pos ? `${pos.left}px` : '0px',
							minWidth: `${minWidth}px`,
							visibility: pos ? 'visible' : 'hidden',
						}}
					>
						{header && <div class="menu__header">{header}</div>}
						<MenuList id={menuId} items={items} onClose={close} ariaLabel={ariaLabel} />
						{footer && <div class="menu__footer">{footer}</div>}
					</div>
				</Portal>
			)}
		</>
	);
}

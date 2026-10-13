import type { JSX } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Portal, useOverlayLayer } from '../Portal';
import { MenuList } from '../Menu/MenuList';
import { clampPoint } from '../Menu/position';
import type { MenuItem } from '../Menu/types';
import '../Menu/Menu.scss';

export interface ContextMenuProps {
	open: boolean;
	x: number;
	y: number;
	items: MenuItem[];
	onClose: () => void;
	class?: string;
	ariaLabel?: string;
}

export function ContextMenu({ open, x, y, items, onClose, class: className, ariaLabel = 'Context menu' }: ContextMenuProps): JSX.Element | null {
	const ref = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

	useLayoutEffect(() => {
		if (!open || !ref.current) {
			setPos(null);
			return;
		}
		setPos(clampPoint(x, y, { width: ref.current.offsetWidth, height: ref.current.offsetHeight }));
	}, [open, x, y, items.length]);

	useClickOutside([ref], () => onClose(), open);
	useOverlayLayer(open, onClose);

	if (!open) return null;
	return (
		<Portal>
			<div
				ref={ref}
				class={cx('menu', 'menu--context', className)}
				style={{ top: `${pos?.top ?? y}px`, left: `${pos?.left ?? x}px`, visibility: pos ? 'visible' : 'hidden' }}
				onContextMenu={(e) => e.preventDefault()}
			>
				<MenuList items={items} onClose={() => onClose()} ariaLabel={ariaLabel} />
			</div>
		</Portal>
	);
}

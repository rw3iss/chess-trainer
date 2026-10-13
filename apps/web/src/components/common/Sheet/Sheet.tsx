import type { ComponentChildren, JSX } from 'preact';
import { useId, useRef, useState } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { IconButton } from '../IconButton';
import { Portal, useOverlayLayer, usePresence } from '../Portal';
import './Sheet.scss';

export interface SheetProps {
	open: boolean;
	onClose: () => void;
	title?: string;
	/** 'full' = calc(100dvh - var(--space-8)). Default 'auto'. */
	height?: 'auto' | 'full';
	side?: 'bottom' | 'right';
	class?: string;
	headerActions?: ComponentChildren;
	children?: ComponentChildren;
}

const EXIT_MS = 240;
const SWIPE_CLOSE_PX = 80;
const SWIPE_CLOSE_VELOCITY = 0.6; // px/ms

export function Sheet({ open, onClose, title, height = 'auto', side = 'bottom', class: className, headerActions, children }: SheetProps): JSX.Element | null {
	const { mounted, state } = usePresence(open, EXIT_MS);
	const panelRef = useRef<HTMLDivElement>(null);
	const titleId = `sht-${useId()}`;
	const drag = useRef<{ y: number; t: number; id: number } | null>(null);
	const [dragY, setDragY] = useState(0);

	useOverlayLayer(open, onClose, { lockScroll: true });
	useFocusTrap(panelRef, open && mounted);

	if (!mounted) return null;

	const onHandleDown = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
		if (side !== 'bottom') return;
		drag.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
		e.currentTarget.setPointerCapture?.(e.pointerId);
	};
	const onHandleMove = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
		if (!drag.current || drag.current.id !== e.pointerId) return;
		setDragY(Math.max(0, e.clientY - drag.current.y));
	};
	const onHandleEnd = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
		const d = drag.current;
		if (!d || d.id !== e.pointerId) return;
		drag.current = null;
		const dy = Math.max(0, e.clientY - d.y);
		const velocity = dy / Math.max(1, performance.now() - d.t);
		setDragY(0);
		if (dy > SWIPE_CLOSE_PX || (dy > 24 && velocity > SWIPE_CLOSE_VELOCITY)) onClose();
	};

	const panelStyle = dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined;

	return (
		<Portal>
			<div class={cx('sheet-layer', `sheet-layer--${side}`)} data-state={state}>
				<div class="sheet-layer__backdrop" aria-hidden="true" onClick={onClose} />
				<div
					ref={panelRef}
					class={cx('sheet', `sheet--${side}`, `sheet--${height}`, className)}
					role="dialog"
					aria-modal="true"
					aria-labelledby={title ? titleId : undefined}
					aria-label={title ? undefined : 'Panel'}
					tabIndex={-1}
					style={panelStyle}
				>
					{side === 'bottom' && (
						<div
							class="sheet__handle"
							aria-hidden="true"
							onPointerDown={onHandleDown}
							onPointerMove={onHandleMove}
							onPointerUp={onHandleEnd}
							onPointerCancel={onHandleEnd}
						>
							<span class="sheet__grip" />
						</div>
					)}
					{(title || headerActions) && (
						<header class="sheet__header">
							{title && (
								<h2 class="sheet__title" id={titleId}>
									{title}
								</h2>
							)}
							<div class="sheet__actions">
								{headerActions}
								<IconButton icon="close" label="Close" size="sm" onClick={onClose} />
							</div>
						</header>
					)}
					<div class="sheet__body">{children}</div>
				</div>
			</div>
		</Portal>
	);
}

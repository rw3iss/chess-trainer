import type { ComponentChildren, JSX } from 'preact';
import { cloneElement, isValidElement, toChildArray } from 'preact';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { Portal } from '../Portal';
import './Tooltip.scss';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
	content: ComponentChildren;
	placement?: TooltipPlacement;
	/** Hover delay in ms. Default 400. Focus shows immediately. */
	delay?: number;
	class?: string;
	children?: ComponentChildren;
}

const GAP = 8;
const MARGIN = 6;

function place(anchor: DOMRect, tip: { width: number; height: number }, preferred: TooltipPlacement): { top: number; left: number; placement: TooltipPlacement } {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const fits: Record<TooltipPlacement, boolean> = {
		top: anchor.top - GAP - tip.height >= MARGIN,
		bottom: anchor.bottom + GAP + tip.height <= vh - MARGIN,
		left: anchor.left - GAP - tip.width >= MARGIN,
		right: anchor.right + GAP + tip.width <= vw - MARGIN,
	};
	const opposite: Record<TooltipPlacement, TooltipPlacement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
	const placement = fits[preferred] || !fits[opposite[preferred]] ? preferred : opposite[preferred];
	let top: number;
	let left: number;
	if (placement === 'top' || placement === 'bottom') {
		top = placement === 'top' ? anchor.top - GAP - tip.height : anchor.bottom + GAP;
		left = anchor.left + anchor.width / 2 - tip.width / 2;
	} else {
		left = placement === 'left' ? anchor.left - GAP - tip.width : anchor.right + GAP;
		top = anchor.top + anchor.height / 2 - tip.height / 2;
	}
	left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, vw - MARGIN - tip.width));
	top = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - MARGIN - tip.height));
	return { top, left, placement };
}

export function Tooltip({ content, placement = 'top', delay = 400, class: className, children }: TooltipProps): JSX.Element {
	const id = `tip-${useId()}`;
	const wrapRef = useRef<HTMLSpanElement>(null);
	const tipRef = useRef<HTMLDivElement>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState<{ top: number; left: number; placement: TooltipPlacement } | null>(null);

	const clearTimer = () => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
	};
	const show = (ms: number) => {
		clearTimer();
		if (ms <= 0) setOpen(true);
		else timer.current = setTimeout(() => setOpen(true), ms);
	};
	const hide = () => {
		clearTimer();
		setOpen(false);
		setPos(null);
	};

	useEffect(() => clearTimer, []);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') hide();
		};
		document.addEventListener('keydown', onKey);
		window.addEventListener('scroll', hide, true);
		return () => {
			document.removeEventListener('keydown', onKey);
			window.removeEventListener('scroll', hide, true);
		};
	}, [open]);

	useLayoutEffect(() => {
		if (!open || !wrapRef.current || !tipRef.current) return;
		const r = wrapRef.current.getBoundingClientRect();
		setPos(place(r, { width: tipRef.current.offsetWidth, height: tipRef.current.offsetHeight }, placement));
	}, [open, placement, content]);

	// Wire aria-describedby onto a single element child too, so the focusable
	// control (not just the wrapper) announces the tooltip.
	const kids = toChildArray(children);
	const child =
		kids.length === 1 && isValidElement(kids[0]) && typeof kids[0].type === 'string'
			? cloneElement(kids[0], { 'aria-describedby': open ? id : undefined })
			: children;

	return (
		<span
			ref={wrapRef}
			class={cx('tooltip-anchor', className)}
			aria-describedby={open ? id : undefined}
			onMouseEnter={() => show(delay)}
			onMouseLeave={hide}
			onFocusIn={(e) => {
				// Only keyboard focus (not a mouse click) shows the tooltip at once.
				const target = e.target as HTMLElement | null;
				if (target?.matches?.(':focus-visible') ?? true) show(0);
			}}
			onFocusOut={hide}
			onPointerDown={hide}
		>
			{child}
			{open && (
				<Portal>
					<div
						ref={tipRef}
						id={id}
						role="tooltip"
						class={cx('tooltip', pos && `tooltip--${pos.placement}`)}
						style={{ top: `${pos?.top ?? 0}px`, left: `${pos?.left ?? 0}px`, visibility: pos ? 'visible' : 'hidden' }}
					>
						{content}
					</div>
				</Portal>
			)}
		</span>
	);
}

// Fixed-row-height windowing. The container scrolls (give it a height via CSS
// or a flex parent); only the visible rows (+ overscan) are rendered.

import type { JSX, VNode } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import './VirtualList.scss';

export interface VirtualListProps<T> {
	items: T[];
	itemHeight: number;
	renderItem: (item: T, index: number) => VNode;
	getKey?: (item: T, index: number) => string | number;
	overscan?: number;
	class?: string;
	onEndReached?: () => void;
	ariaLabel?: string;
	/** Scrolls minimally so this index is visible. */
	scrollToIndex?: number;
}

/** Used before the container has been measured (and in jsdom). */
const FALLBACK_HEIGHT = 400;

export function computeWindow(scrollTop: number, viewport: number, itemHeight: number, count: number, overscan: number): { start: number; end: number } {
	if (count === 0 || itemHeight <= 0) return { start: 0, end: -1 };
	const first = Math.floor(scrollTop / itemHeight);
	const visible = Math.ceil(viewport / itemHeight) + 1;
	const start = Math.max(0, first - overscan);
	const end = Math.min(count - 1, first + visible + overscan);
	return { start, end };
}

export function VirtualList<T>({ items, itemHeight, renderItem, getKey, overscan = 6, class: className, onEndReached, ariaLabel, scrollToIndex }: VirtualListProps<T>): JSX.Element {
	const ref = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewport, setViewport] = useState(0);
	const frame = useRef<number | null>(null);
	const endFiredFor = useRef(-1);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const measure = () => setViewport(el.clientHeight);
		measure();
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
		ro?.observe(el);
		return () => ro?.disconnect();
	}, []);

	useEffect(
		() => () => {
			if (frame.current !== null) cancelAnimationFrame(frame.current);
		},
		[],
	);

	const onScroll = useCallback(() => {
		if (frame.current !== null) return;
		frame.current = requestAnimationFrame(() => {
			frame.current = null;
			if (ref.current) setScrollTop(ref.current.scrollTop);
		});
	}, []);

	useEffect(() => {
		const el = ref.current;
		if (!el || scrollToIndex === undefined || scrollToIndex < 0 || scrollToIndex >= items.length) return;
		const top = scrollToIndex * itemHeight;
		const bottom = top + itemHeight;
		const h = el.clientHeight || FALLBACK_HEIGHT;
		if (top < el.scrollTop) el.scrollTop = top;
		else if (bottom > el.scrollTop + h) el.scrollTop = bottom - h;
		setScrollTop(el.scrollTop);
	}, [scrollToIndex, itemHeight, items.length]);

	const { start, end } = computeWindow(scrollTop, viewport || FALLBACK_HEIGHT, itemHeight, items.length, overscan);

	useEffect(() => {
		if (!onEndReached || items.length === 0) return;
		if (end >= items.length - 1 - Math.max(1, Math.floor(overscan / 2)) && endFiredFor.current !== items.length) {
			endFiredFor.current = items.length;
			onEndReached();
		}
	}, [end, items.length, onEndReached, overscan]);

	const rows: VNode[] = [];
	for (let i = start; i <= end; i++) {
		const item = items[i];
		rows.push(
			<div
				key={getKey ? getKey(item, i) : i}
				role="listitem"
				aria-setsize={items.length}
				aria-posinset={i + 1}
				class="virtual-list__row"
				style={{ transform: `translateY(${i * itemHeight}px)`, height: `${itemHeight}px` }}
			>
				{renderItem(item, i)}
			</div>,
		);
	}

	return (
		<div ref={ref} class={cx('virtual-list', className)} role="list" aria-label={ariaLabel} onScroll={onScroll}>
			<div class="virtual-list__spacer" role="none" style={{ height: `${items.length * itemHeight}px` }}>
				{rows}
			</div>
		</div>
	);
}

// Renders the toast stack (bottom-center, above mobile sticky controls).
// Mount once near the app root. Keeps removed toasts around briefly for the
// exit animation; hovering/focusing a toast pauses its timer.

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { toast, toasts, type ToastItem, type ToastKind } from '@/services/toast';
import { Icon, type IconName } from '../Icon';
import './Toast.scss';

const EXIT_MS = 180;

const KIND_ICON: Record<ToastKind, IconName> = { info: 'info', success: 'check', warn: 'warning', error: 'warning' };

interface Rendered {
	item: ToastItem;
	leaving: boolean;
}

export function ToastHost(): JSX.Element {
	const live = toasts.value;
	const [rendered, setRendered] = useState<Rendered[]>(() => live.map((item) => ({ item, leaving: false })));
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	useEffect(() => {
		const liveIds = new Set(live.map((t) => t.id));
		setRendered((prev) => {
			const next: Rendered[] = [];
			const seen = new Set<string>();
			for (const r of prev) {
				const current = live.find((t) => t.id === r.item.id);
				if (current) {
					next.push({ item: current, leaving: false });
					seen.add(current.id);
				} else next.push({ item: r.item, leaving: true });
			}
			for (const t of live) if (!seen.has(t.id)) next.push({ item: t, leaving: false });
			return next;
		});
		// Schedule removal of leaving items.
		for (const [id, handle] of timers.current) {
			if (liveIds.has(id)) {
				clearTimeout(handle);
				timers.current.delete(id);
			}
		}
	}, [live]);

	useEffect(() => {
		for (const r of rendered) {
			if (!r.leaving || timers.current.has(r.item.id)) continue;
			const id = r.item.id;
			timers.current.set(
				id,
				setTimeout(() => {
					timers.current.delete(id);
					setRendered((prev) => prev.filter((x) => !(x.leaving && x.item.id === id)));
				}, EXIT_MS),
			);
		}
	}, [rendered]);

	useEffect(() => {
		const map = timers.current;
		return () => {
			for (const h of map.values()) clearTimeout(h);
			map.clear();
		};
	}, []);

	return (
		<div class="toast-host" aria-live="polite" aria-relevant="additions text" role="region" aria-label="Notifications">
			{rendered.map(({ item, leaving }) => (
				<div
					key={item.id}
					class={cx('toast', `toast--${item.kind}`, { 'toast--leaving': leaving })}
					role={item.kind === 'error' ? 'alert' : 'status'}
					aria-hidden={leaving || undefined}
					inert={leaving || undefined}
					onMouseEnter={() => toast.pause(item.id)}
					onMouseLeave={() => toast.resume(item.id)}
					onFocusIn={() => toast.pause(item.id)}
					onFocusOut={() => toast.resume(item.id)}
				>
					<Icon name={KIND_ICON[item.kind]} size={18} class="toast__icon" />
					<div class="toast__content">
						{item.title && <div class="toast__title">{item.title}</div>}
						<div class="toast__message">{item.message}</div>
					</div>
					{item.action && (
						<button
							type="button"
							class="toast__action"
							onClick={() => {
								item.action?.onClick();
								toast.dismiss(item.id);
							}}
						>
							{item.action.label}
						</button>
					)}
					<button type="button" class="toast__close" aria-label="Dismiss notification" onClick={() => toast.dismiss(item.id)}>
						<Icon name="close" size={16} />
					</button>
				</div>
			))}
		</div>
	);
}

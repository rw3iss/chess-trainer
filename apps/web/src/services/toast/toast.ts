// Toast notification service. State lives in a signal so any component (and
// non-component code: services, error handlers) can raise a toast.
//
//   toast.success('Repertoire saved');
//   toast.error('Engine crashed', { title: 'Stockfish', durationMs: 0 });
//   toast.info('Syncing…', { id: 'sync' });   // same id → replaces in place

import { signal, type ReadonlySignal } from '@preact/signals';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface ToastOptions {
	message: string;
	kind?: ToastKind;
	title?: string;
	/** Default 4000; 0 = sticky. */
	durationMs?: number;
	action?: ToastAction;
	/** Dedupe key: replaces an existing toast with the same id. */
	id?: string;
}

export interface ToastItem extends Required<Pick<ToastOptions, 'message' | 'kind'>> {
	id: string;
	title?: string;
	durationMs: number;
	action?: ToastAction;
	createdAt: number;
}

export const DEFAULT_TOAST_MS = 4000;
const MAX_TOASTS = 5;

const state = signal<ToastItem[]>([]);
export const toasts: ReadonlySignal<ToastItem[]> = state;

interface TimerState {
	handle: ReturnType<typeof setTimeout> | null;
	remaining: number;
	startedAt: number;
}

const timers = new Map<string, TimerState>();
let seq = 0;

function clearTimer(id: string): void {
	const t = timers.get(id);
	if (t?.handle) clearTimeout(t.handle);
	timers.delete(id);
}

function startTimer(id: string, ms: number): void {
	clearTimer(id);
	if (ms <= 0) return;
	timers.set(id, { handle: setTimeout(() => dismiss(id), ms), remaining: ms, startedAt: Date.now() });
}

function show(opts: ToastOptions): string {
	const id = opts.id ?? `toast-${++seq}`;
	const item: ToastItem = {
		id,
		message: opts.message,
		kind: opts.kind ?? 'info',
		title: opts.title,
		durationMs: opts.durationMs ?? DEFAULT_TOAST_MS,
		action: opts.action,
		createdAt: Date.now(),
	};
	const list = state.value;
	const existing = list.findIndex((t) => t.id === id);
	let next: ToastItem[];
	if (existing >= 0) {
		next = list.slice();
		next[existing] = item;
	} else {
		next = [...list, item];
		while (next.length > MAX_TOASTS) {
			const dropped = next.shift();
			if (dropped) clearTimer(dropped.id);
		}
	}
	state.value = next;
	startTimer(id, item.durationMs);
	return id;
}

function dismiss(id: string): void {
	clearTimer(id);
	if (!state.value.some((t) => t.id === id)) return;
	state.value = state.value.filter((t) => t.id !== id);
}

function clear(): void {
	for (const id of timers.keys()) clearTimer(id);
	state.value = [];
}

/** Pause auto-dismiss (e.g. while hovered). */
function pause(id: string): void {
	const t = timers.get(id);
	if (!t || !t.handle) return;
	clearTimeout(t.handle);
	t.handle = null;
	t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
}

/** Resume a paused auto-dismiss with its remaining time. */
function resume(id: string): void {
	const t = timers.get(id);
	if (!t || t.handle) return;
	t.startedAt = Date.now();
	t.handle = setTimeout(() => dismiss(id), Math.max(600, t.remaining));
}

type Shortcut = (message: string, opts?: Omit<ToastOptions, 'message' | 'kind'>) => string;
const kind =
	(k: ToastKind): Shortcut =>
	(message, opts) =>
		show({ ...opts, message, kind: k });

export const toast = {
	show,
	info: kind('info'),
	success: kind('success'),
	warn: kind('warn'),
	error: kind('error'),
	dismiss,
	clear,
	pause,
	resume,
};

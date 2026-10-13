// Extension slots — let later features plug UI into the shell without editing it.
//   export const stageSlots = { top: createSlot<StageSlotProps>('stage.top'), ... }
//   const off = stageSlots.top.register(ClockStrip);         // feature side
//   <stageSlots.top.Render session={s} position="top" />     // shell side
// The most recently registered component renders (stack); unregister restores the previous one.
import { signal } from '@preact/signals';
import type { ComponentType, JSX } from 'preact';

export interface Slot<P> {
	readonly name: string;
	register(component: ComponentType<P>): () => void;
	readonly has: () => boolean;
	Render: (props: P & { fallback?: JSX.Element | null }) => JSX.Element | null;
}

export function createSlot<P extends object>(name: string): Slot<P> {
	const stack = signal<ComponentType<P>[]>([]);
	const Render = (props: P & { fallback?: JSX.Element | null }) => {
		const list = stack.value;
		const Comp = list[list.length - 1];
		if (!Comp) return props.fallback ?? null;
		const { fallback: _fallback, ...rest } = props;
		return <Comp {...(rest as P)} />;
	};
	return {
		name,
		register(component) {
			stack.value = [...stack.value, component];
			return () => {
				stack.value = stack.value.filter((c) => c !== component);
			};
		},
		has: () => stack.value.length > 0,
		Render,
	};
}

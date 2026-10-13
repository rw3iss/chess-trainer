// Command bus — decouples triggers (keyboard shortcuts, menus, buttons) from
// the features that handle them. Features register handlers; anything can
// dispatch. Unknown commands are a no-op (returns false) so a shortcut can
// exist before its feature lands (e.g. 'save' before the SaveModal).
//
//   const off = commands.register('save', () => openSaveModal());
//   commands.dispatch('save');

export interface CommandMap {
	save: void;
	saveAs: void;
	focusSearch: void;
	openBot: void;
	newGame: void;
	togglePlay: void;
	flip: void;
	fork: void;
	/** Open a user-note editor for the current position. */
	editNote: void;
	/** Extension point: other features add their own commands via declaration merging. */
}

export type CommandId = keyof CommandMap & string;
export type CommandHandler<K extends CommandId> = (payload: CommandMap[K]) => void;

type AnyHandler = (payload: unknown) => void;

export class CommandBus {
	private handlers = new Map<string, AnyHandler[]>();
	private listeners = new Set<(id: string, payload: unknown) => void>();

	/** Register a handler. The most recently registered handler wins (stack). Returns unregister. */
	register<K extends CommandId>(id: K, handler: CommandHandler<K>): () => void {
		const stack = this.handlers.get(id) ?? [];
		stack.push(handler as AnyHandler);
		this.handlers.set(id, stack);
		return () => {
			const s = this.handlers.get(id);
			if (!s) return;
			const i = s.lastIndexOf(handler as AnyHandler);
			if (i >= 0) s.splice(i, 1);
			if (!s.length) this.handlers.delete(id);
		};
	}

	/** Run the active handler. Returns true if one handled it. */
	dispatch<K extends CommandId>(id: K, ...args: CommandMap[K] extends void ? [] : [CommandMap[K]]): boolean {
		const payload = args[0];
		this.listeners.forEach((fn) => fn(id, payload));
		const stack = this.handlers.get(id);
		const handler = stack?.[stack.length - 1];
		if (!handler) return false;
		handler(payload);
		return true;
	}

	has(id: CommandId): boolean {
		return (this.handlers.get(id)?.length ?? 0) > 0;
	}

	/** Observe every dispatch (analytics, debugging, tests). */
	onDispatch(fn: (id: string, payload: unknown) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}
}

export const commands = new CommandBus();

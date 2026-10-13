// Store registry — the pattern every signal store follows.
//
// A store is a module (src/state/<name>.ts) that:
//   1. owns its signals (module-level `signal()`s; export them read-only or as computed),
//   2. exports plain action functions (or an `actions` object) that are the ONLY writers,
//   3. reads/writes persisted data through repositories (`getRepositories()` from
//      services/db) — never Dexie directly,
//   4. calls `defineStore({ name, init })` so boot (`initStores()`) restores it.
// Then add `import './<name>';` in src/state/index.ts (and re-export its API).
//
// Later stores (openings, engines, themeEditor, …) follow exactly this shape.

export interface StoreDefinition {
	name: string;
	/** Load persisted state. Runs once at boot, in registration order. */
	init?: () => Promise<void> | void;
	/** Flush pending writes (called on pagehide / before tests assert). */
	flush?: () => Promise<void> | void;
	/** Tear down timers/listeners (tests). */
	dispose?: () => void;
}

const stores: StoreDefinition[] = [];

export function defineStore(def: StoreDefinition): StoreDefinition {
	const i = stores.findIndex((s) => s.name === def.name);
	if (i >= 0) stores[i] = def;
	else stores.push(def);
	return def;
}

export function registeredStores(): readonly StoreDefinition[] {
	return stores;
}

/** Initialise every registered store; one failing store never blocks the rest. */
export async function initStores(): Promise<void> {
	for (const s of stores) {
		try {
			await s.init?.();
		} catch (e) {
			console.error(`[state] init failed: ${s.name}`, e);
		}
	}
}

export async function flushStores(): Promise<void> {
	await Promise.all(stores.map((s) => Promise.resolve(s.flush?.()).catch((e) => console.error(`[state] flush failed: ${s.name}`, e))));
}

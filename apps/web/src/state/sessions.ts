// Sessions store — open game "tabs" (PLAN §3). Every mutation goes through a
// pure @chess/core reducer, then the changed session is autosaved (debounced
// 300 ms) via SessionsRepository. Order + active id persist as meta.
//
// Read:   openSessions, activeSession, activeId, sessionCount, getSession(id)
// Write:  sessionsActions.* (all take an optional session id; default = active)
// Events: onSessionEvent(fn) — 'user-action' fires for every manual move/step/goto
//         (PlaybackController pauses on it), 'closed' when a tab closes.
import { batch, computed, signal } from '@preact/signals';
import {
	ROOT_ID,
	deleteFrom,
	getNode,
	lineEnd,
	pathTo,
	promoteVariation,
	setComment,
	setUserNote,
	type Uci,
} from '@chess/core/chess';
import {
	createSession,
	defaultTitle,
	forkSession,
	sessionFromOpening,
	sessionFromSavedGame,
	sessionGoto,
	sessionMove,
	sessionStep,
	sessionToEnd,
	sessionToStart,
	sessionUpdate,
	type NewSessionOptions,
	type SavedGame,
	type Session,
	type SessionMode,
} from '@chess/core/game';
import type { OpeningEntry } from '@chess/core/openings';
import { getRepositories } from '@/services/db';
import { debounce } from '@/lib/throttle';
import { defineStore } from './registry';

export const AUTOSAVE_DEBOUNCE_MS = 300;

export type SessionEvent =
	| { type: 'user-action'; sessionId: string; action: 'move' | 'step' | 'goto' | 'start' | 'end' | 'edit' }
	| { type: 'opened'; sessionId: string }
	| { type: 'closed'; sessionId: string }
	| { type: 'activated'; sessionId: string | null };

// ── State ─────────────────────────────────────────────────────────────────
const _sessions = signal<Record<string, Session>>({});
const _order = signal<string[]>([]);
const _activeId = signal<string | null>(null);
const _restored = signal(false);

export const activeId = computed(() => _activeId.value);
export const sessionsRestored = computed(() => _restored.value);
export const openSessions = computed(() => _order.value.map((id) => _sessions.value[id]).filter((s): s is Session => !!s));
export const sessionCount = computed(() => _order.value.length);
export const activeSession = computed<Session | null>(() => (_activeId.value ? (_sessions.value[_activeId.value] ?? null) : null));

export function getSession(id: string | null | undefined): Session | null {
	return id ? (_sessions.value[id] ?? null) : null;
}

// ── Events ────────────────────────────────────────────────────────────────
const listeners = new Set<(e: SessionEvent) => void>();
export function onSessionEvent(fn: (e: SessionEvent) => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}
function emit(e: SessionEvent): void {
	listeners.forEach((fn) => fn(e));
}

// ── Persistence ───────────────────────────────────────────────────────────
const dirtyIds = new Set<string>();
const removedIds = new Set<string>();
let metaDirty = false;

async function writePending(): Promise<void> {
	const repo = getRepositories().sessions;
	const toPut = [...dirtyIds].map((id) => _sessions.value[id]).filter((s): s is Session => !!s);
	const toRemove = [...removedIds];
	const writeMeta = metaDirty;
	dirtyIds.clear();
	removedIds.clear();
	metaDirty = false;
	if (toPut.length) await repo.putMany(toPut);
	for (const id of toRemove) await repo.remove(id);
	if (writeMeta) await repo.setMeta({ order: _order.value, activeId: _activeId.value });
}

let writing: Promise<void> = Promise.resolve();
const autosave = debounce(() => {
	writing = writing.then(writePending).catch((e) => console.error('[sessions] autosave failed', e));
}, AUTOSAVE_DEBOUNCE_MS);

function markDirty(id: string): void {
	dirtyIds.add(id);
	autosave();
}
function markMeta(): void {
	metaDirty = true;
	autosave();
}

/** Write everything pending now (pagehide, tests). */
export async function flushSessions(): Promise<void> {
	autosave.flush();
	await writing;
}

// ── Internals ─────────────────────────────────────────────────────────────
function resolveId(id?: string): string | null {
	return id ?? _activeId.value;
}

function put(session: Session): void {
	_sessions.value = { ..._sessions.value, [session.id]: session };
	markDirty(session.id);
}

/** Apply a pure reducer to a session. Returns the new session (or null when missing/unchanged-null). */
function apply(id: string | undefined, fn: (s: Session) => Session | null): Session | null {
	const sid = resolveId(id);
	const cur = getSession(sid);
	if (!cur) return null;
	const next = fn(cur);
	if (!next || next === cur) return next;
	put(next);
	return next;
}

function userAction(id: string | undefined, action: Extract<SessionEvent, { type: 'user-action' }>['action'], opts?: ActionOpts): void {
	if (opts?.silent) return;
	const sid = resolveId(id);
	if (sid) emit({ type: 'user-action', sessionId: sid, action });
}

export interface ActionOpts {
	/** Programmatic (playback/bot) — does not emit 'user-action'. */
	silent?: boolean;
}

// ── Actions ───────────────────────────────────────────────────────────────
function open(session: Session, opts: { activate?: boolean; index?: number } = {}): Session {
	batch(() => {
		put(session);
		if (!_order.value.includes(session.id)) {
			const order = [..._order.value];
			order.splice(opts.index ?? order.length, 0, session.id);
			_order.value = order;
		}
		if (opts.activate ?? true) _activeId.value = session.id;
	});
	markMeta();
	emit({ type: 'opened', sessionId: session.id });
	if (opts.activate ?? true) emit({ type: 'activated', sessionId: session.id });
	return session;
}

function insertAfterActive(): number {
	const i = _activeId.value ? _order.value.indexOf(_activeId.value) : -1;
	return i >= 0 ? i + 1 : _order.value.length;
}

export const sessionsActions = {
	open,

	newSession(opts: NewSessionOptions = {}): Session {
		return open(createSession(opts), { index: insertAfterActive() });
	},

	/** Load an opening. Reuses the active session if it is an untouched opening session and `reuseUntouched`. */
	fromOpening(entry: OpeningEntry, opts: NewSessionOptions & { reuseUntouched?: boolean } = {}): Session {
		const { reuseUntouched, ...rest } = opts;
		const active = activeSession.value;
		const s = sessionFromOpening(entry, rest);
		if (reuseUntouched && active && active.source.kind === 'opening' && !active.dirty && !active.savedGameId) {
			const replaced: Session = { ...s, id: active.id, createdAt: active.createdAt, revision: active.revision + 1 };
			put(replaced);
			emit({ type: 'opened', sessionId: replaced.id });
			return replaced;
		}
		return open(s, { index: insertAfterActive() });
	},

	/** Open a saved game, focusing an already-open session linked to it. */
	fromSavedGame(game: SavedGame): Session {
		const existing = openSessions.value.find((s) => s.savedGameId === game.id);
		if (existing) {
			sessionsActions.setActive(existing.id);
			return existing;
		}
		return open(sessionFromSavedGame(game), { index: insertAfterActive() });
	},

	/** Fork at nodeId (default: cursor) into a new active session placed after the source. */
	fork(id?: string, nodeId?: string): Session | null {
		const src = getSession(resolveId(id));
		if (!src) return null;
		const forked = forkSession(src, nodeId ?? src.cursor);
		const i = _order.value.indexOf(src.id);
		return open(forked, { index: i >= 0 ? i + 1 : undefined });
	},

	close(id?: string): void {
		const sid = resolveId(id);
		if (!sid || !_sessions.value[sid]) return;
		batch(() => {
			const order = _order.value;
			const idx = order.indexOf(sid);
			const nextOrder = order.filter((x) => x !== sid);
			const { [sid]: _removed, ...rest } = _sessions.value;
			_sessions.value = rest;
			_order.value = nextOrder;
			if (_activeId.value === sid) _activeId.value = nextOrder[Math.min(idx, nextOrder.length - 1)] ?? null;
		});
		dirtyIds.delete(sid);
		removedIds.add(sid);
		markMeta();
		emit({ type: 'closed', sessionId: sid });
		emit({ type: 'activated', sessionId: _activeId.value });
	},

	setActive(id: string | null): void {
		if (id !== null && !_sessions.value[id]) return;
		if (_activeId.value === id) return;
		_activeId.value = id;
		markMeta();
		emit({ type: 'activated', sessionId: id });
	},

	reorder(order: string[]): void {
		const known = new Set(_order.value);
		_order.value = order.filter((id) => known.has(id));
		markMeta();
	},

	move(uci: Uci, id?: string, opts?: ActionOpts): Session | null {
		const next = apply(id, (s) => {
			const moved = sessionMove(s, uci);
			// Auto-titled sessions keep a live title ('Analysis — 1.e4 c5 2.Nf3'); user titles stick.
			return moved && s.title === defaultTitle(s) ? { ...moved, title: defaultTitle(moved) } : moved;
		});
		if (next) userAction(next.id, 'move', opts);
		return next;
	},

	goto(nodeId: string, id?: string, opts?: ActionOpts): Session | null {
		userAction(id, 'goto', opts);
		return apply(id, (s) => (s.tree.nodes[nodeId] ? sessionGoto(s, nodeId) : s));
	},

	step(delta: number, id?: string, opts?: ActionOpts): Session | null {
		userAction(id, 'step', opts);
		return apply(id, (s) => sessionStep(s, delta));
	},

	toStart(id?: string, opts?: ActionOpts): Session | null {
		userAction(id, 'start', opts);
		return apply(id, sessionToStart);
	},

	toEnd(id?: string, opts?: ActionOpts): Session | null {
		userAction(id, 'end', opts);
		return apply(id, sessionToEnd);
	},

	flip(id?: string): Session | null {
		return apply(id, (s) => sessionUpdate(s, { orientation: s.orientation === 'white' ? 'black' : 'white' }));
	},

	setMode(mode: SessionMode, extra: Partial<Pick<Session, 'bot' | 'pvp' | 'clock'>> = {}, id?: string): Session | null {
		return apply(id, (s) => sessionUpdate(s, { mode, ...extra }));
	},

	update(patch: Partial<Session>, id?: string): Session | null {
		return apply(id, (s) => {
			const next = sessionUpdate(s, patch);
			// Auto-titled sessions follow mode / bot changes ('Analysis' → 'Bot 1500 — 1.e4'); user titles stick.
			return !('title' in patch) && s.title === defaultTitle(s) ? { ...next, title: defaultTitle(next) } : next;
		});
	},

	/** Replace a session wholesale (e.g. after linking to a saved game). */
	replace(session: Session): void {
		if (!_sessions.value[session.id]) return;
		put(session);
	},

	rename(title: string, id?: string): Session | null {
		const t = title.trim();
		return t ? apply(id, (s) => sessionUpdate(s, { title: t })) : null;
	},

	/** Delete nodeId and its subtree; the cursor moves to the parent if it was inside. */
	deleteFrom(nodeId: string, id?: string): Session | null {
		userAction(id, 'edit');
		return apply(id, (s) => {
			const node = s.tree.nodes[nodeId];
			if (!node || node.parentId === null) return s;
			const insideDeleted = pathTo(s.tree, s.cursor).some((n) => n.id === nodeId);
			const tree = deleteFrom(s.tree, nodeId);
			return sessionUpdate(s, { tree, cursor: insideDeleted ? node.parentId : s.cursor, dirty: true });
		});
	},

	promoteVariation(nodeId: string, id?: string): Session | null {
		return apply(id, (s) => (s.tree.nodes[nodeId] ? sessionUpdate(s, { tree: promoteVariation(s.tree, nodeId), dirty: true }) : s));
	},

	setUserNote(nodeId: string, note: string | undefined, id?: string): Session | null {
		const v = note?.trim() ? note : undefined;
		return apply(id, (s) => (s.tree.nodes[nodeId] ? sessionUpdate(s, { tree: setUserNote(s.tree, nodeId, v), dirty: true }) : s));
	},

	setComment(nodeId: string, comment: string | undefined, id?: string): Session | null {
		return apply(id, (s) => (s.tree.nodes[nodeId] ? sessionUpdate(s, { tree: setComment(s.tree, nodeId, comment), dirty: true }) : s));
	},
};

// ── Derived helpers for views ─────────────────────────────────────────────
/** True when the cursor is at the end of its line (nothing to play forward). */
export function isAtLineEnd(s: Session): boolean {
	return lineEnd(s.tree, s.cursor) === s.cursor;
}

export function isAtStart(s: Session): boolean {
	return s.cursor === ROOT_ID;
}

export function cursorNode(s: Session) {
	return getNode(s.tree, s.cursor);
}

// ── Boot ──────────────────────────────────────────────────────────────────
export async function restoreSessions(): Promise<void> {
	const repo = getRepositories().sessions;
	const [list, meta] = await Promise.all([repo.list(), repo.getMeta()]);
	const map: Record<string, Session> = {};
	for (const s of list) map[s.id] = { ...s, playback: { ...s.playback, playing: false } };
	const order = (meta?.order ?? []).filter((id) => map[id]);
	// Sessions present in the table but missing from meta (e.g. crash mid-write) are appended by recency.
	const extra = list.filter((s) => !order.includes(s.id)).sort((a, b) => a.updatedAt - b.updatedAt).map((s) => s.id);
	const fullOrder = [...order, ...extra];
	batch(() => {
		_sessions.value = map;
		_order.value = fullOrder;
		_activeId.value = meta?.activeId && map[meta.activeId] ? meta.activeId : (fullOrder[fullOrder.length - 1] ?? null);
		_restored.value = true;
	});
	emit({ type: 'activated', sessionId: _activeId.value });
}

/** Test helper: clear in-memory state (does not touch the db). */
export function resetSessionsState(): void {
	autosave.cancel();
	dirtyIds.clear();
	removedIds.clear();
	metaDirty = false;
	batch(() => {
		_sessions.value = {};
		_order.value = [];
		_activeId.value = null;
		_restored.value = false;
	});
}

defineStore({
	name: 'sessions',
	init: restoreSessions,
	flush: flushSessions,
	dispose: () => autosave.cancel(),
});

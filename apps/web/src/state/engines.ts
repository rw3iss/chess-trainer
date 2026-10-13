// Engines store — engine catalog/availability, analysis (Analyzer on the active
// session) and bot play (one BotPlayer per session in 'bot' mode).
//
// Read:   engineEntries, enginesLoaded, availableEngines, engineEntry(id), downloads,
//         analysisPrefs, analysisEngineId, analysis, analysisStatus, analysisError,
//         botThinking, isBotThinking(id), botError(id), botTip(id)
// Write:  enginesActions.* (refresh/download/cancelDownload/remove/importMaia/setDefault),
//         analysisActions.* (toggle/setEnabled/setMultiPv/setEngine),
//         botActions.* (attach/detach/takeback/updateConfig)
//
// Bot rule: the bot only moves when the session cursor is at the *tip* of the bot
// game line. The tip starts at the cursor on attach and follows every move made at
// the tip (and any leaf the user moves to). Browsing back never makes the bot move.
// Controllers live here (not in components), so bots keep playing across routes.
import { batch, computed, effect, signal, untracked } from '@preact/signals';
import { ROOT_ID, turnFromFen, uciPathTo, type Color } from '@chess/core/chess';
import { createClock, type ClockConfig } from '@chess/core/clock';
import type { EnginePosition, Uci } from '@chess/core';
import type { BotConfig as SessionBotConfig, Session } from '@chess/core/game';
import { Analyzer, BotPlayer, EngineRegistry, isAbortError, type AnalysisState, type DownloadProgress, type EngineEntry } from '@/services/engine';
import { api } from '@/services/api';
import { getRepositories } from '@/services/db';
import { serverConnector } from '@/services/server';
import { toast } from '@/services/toast';
import { getSession, openSessions, activeSession, sessionsActions } from './sessions';
import { settings, updateSettings } from './settings';
import { accessToken } from './auth';
import { defineStore } from './registry';

export const ENGINE_PREFS_KEY = 'engine.prefs';
export const MULTIPV_MIN = 1;
export const MULTIPV_MAX = 5;
/** Plies for which a Maia bot plays book moves (Maia-2 never trained on them). */
export const BOOK_PLIES = 10;

export interface AnalysisPrefs {
	enabled: boolean;
	multiPv: number;
	/** Engine used for analysis; null = the default engine (settings.engine.defaultEngineId). */
	engineId: string | null;
}

export const DEFAULT_ANALYSIS_PREFS: AnalysisPrefs = { enabled: false, multiPv: 3, engineId: null };

export type AnalysisStatus = 'off' | 'loading' | 'running' | 'paused' | 'idle' | 'error';

/** Bot setup chosen in the BotModal. `clock` null = no clock. */
export interface BotSetup extends SessionBotConfig {
	clock?: ClockConfig | null;
}

// ── State ─────────────────────────────────────────────────────────────────
const _entries = signal<EngineEntry[]>([]);
const _loaded = signal(false);
const _downloads = signal<Record<string, DownloadProgress>>({});
const _prefs = signal<AnalysisPrefs>(DEFAULT_ANALYSIS_PREFS);
const _analysis = signal<AnalysisState | null>(null);
const _analysisLoading = signal(false);
const _analysisError = signal<string | null>(null);
const _thinking = signal<Record<string, boolean>>({});
const _botErrors = signal<Record<string, string>>({});
const _tips = signal<Record<string, string>>({});

export const engineEntries = computed(() => _entries.value);
export const enginesLoaded = computed(() => _loaded.value);
export const availableEngines = computed(() => _entries.value.filter((e) => e.availability.available));
export const downloads = computed(() => _downloads.value);
export const analysisPrefs = computed(() => _prefs.value);
export const analysis = computed(() => _analysis.value);
export const analysisError = computed(() => _analysisError.value);
export const botThinking = computed(() => _thinking.value);

export function engineEntry(id: string | null | undefined): EngineEntry | undefined {
	return id ? _entries.value.find((e) => e.meta.id === id) : undefined;
}

/** First available of: explicit analysis engine → default engine → sf-lite. */
function usable(id: string | null | undefined): id is string {
	return !!id && (!_loaded.value || !!engineEntry(id)?.availability.available);
}

export const analysisEngineId = computed(() => {
	const { engineId } = _prefs.value;
	const def = settings.value.engine.defaultEngineId;
	if (usable(engineId)) return engineId;
	if (usable(def)) return def;
	return 'sf-lite';
});

export const analysisStatus = computed<AnalysisStatus>(() => {
	if (!_prefs.value.enabled) return 'off';
	if (_analysisError.value) return 'error';
	if (_analysisLoading.value) return 'loading';
	const a = _analysis.value;
	if (!a) return 'idle';
	if (a.paused) return 'paused';
	return a.running ? 'running' : 'idle';
});

export function isBotThinking(sessionId: string | null | undefined): boolean {
	return !!sessionId && !!_thinking.value[sessionId];
}

export function botError(sessionId: string | null | undefined): string | undefined {
	return sessionId ? _botErrors.value[sessionId] : undefined;
}

export function botTip(sessionId: string | null | undefined): string | undefined {
	return sessionId ? _tips.value[sessionId] : undefined;
}

/** True when the bot may move in this session (cursor at the bot line tip). */
export function isAtBotTip(s: Session): boolean {
	return _tips.value[s.id] === s.cursor;
}

// ── Registry ──────────────────────────────────────────────────────────────
// Openings store (other feature) exports `openingIndex` (Signal<OpeningIndex | null>).
// import.meta.glob keeps this optional: empty until state/openings.ts exists.
const openingsModule = import.meta.glob<{ openingIndex?: { value: { continuations(fen: string): { uci: Uci; popularity?: number }[] } | null } }>('./openings.ts');

let openingIndexRef: { value: { continuations(fen: string): { uci: Uci; popularity?: number }[] } | null } | null = null;

function loadOpeningIndexRef(): void {
	const load = openingsModule['./openings.ts'];
	if (!load || openingIndexRef) return;
	void load()
		.then((m) => {
			if (m.openingIndex) openingIndexRef = m.openingIndex;
		})
		.catch(() => undefined);
}

/** Book move weighted by popularity (for Maia's first plies). Pure apart from `rng`. */
export function pickBookMove(continuations: { uci: Uci; popularity?: number }[], rng: () => number = Math.random): Uci | null {
	if (!continuations.length) return null;
	const weights = continuations.map((c) => Math.max(0.0001, c.popularity ?? 0.0001));
	const total = weights.reduce((a, b) => a + b, 0);
	let r = rng() * total;
	for (let i = 0; i < continuations.length; i++) {
		r -= weights[i]!;
		if (r <= 0) return continuations[i]!.uci;
	}
	return continuations[continuations.length - 1]!.uci;
}

function bookMove(fen: string, ply: number): Uci | null {
	if (ply >= BOOK_PLIES) return null;
	const idx = openingIndexRef?.value;
	return idx ? pickBookMove(idx.continuations(fen)) : null;
}

let registry: EngineRegistry | null = null;

/** The shared EngineRegistry (created lazily). */
export function getEngineRegistry(): EngineRegistry {
	if (!registry) {
		registry = new EngineRegistry({ maia: { openingMove: bookMove } });
		registry.subscribe(() => void refreshList(false));
	}
	return registry;
}

/** Inject a registry (tests / custom hosting). Call before boot / initStores. */
export function setEngineRegistry(r: EngineRegistry): void {
	registry?.dispose();
	registry = r;
	r.subscribe(() => void refreshList(false));
}

let listSeq = 0;
async function refreshList(refreshRemote: boolean): Promise<void> {
	const seq = ++listSeq;
	try {
		const list = await getEngineRegistry().list({ refreshRemote });
		if (seq !== listSeq) return;
		batch(() => {
			_entries.value = list;
			_loaded.value = true;
		});
	} catch (e) {
		console.error('[engines] list failed', e);
		_loaded.value = true;
	}
}

// ── Prefs persistence ─────────────────────────────────────────────────────
function setPrefs(patch: Partial<AnalysisPrefs>): void {
	_prefs.value = { ..._prefs.value, ...patch };
	void getRepositories().kv.set(ENGINE_PREFS_KEY, _prefs.value).catch(() => undefined);
}

// ── Engine actions ────────────────────────────────────────────────────────
const aborts = new Map<string, AbortController>();

export const enginesActions = {
	refresh: (): Promise<void> => refreshList(true),

	async download(id: string): Promise<boolean> {
		if (aborts.has(id)) return false;
		const ctrl = new AbortController();
		aborts.set(id, ctrl);
		_downloads.value = { ..._downloads.value, [id]: { loadedBytes: 0, totalBytes: 0, fraction: 0 } };
		try {
			await getEngineRegistry().download(id, (p) => (_downloads.value = { ..._downloads.value, [id]: p }), ctrl.signal);
			toast.success(`${engineEntry(id)?.meta.name ?? id} downloaded`, { id: `engine-dl-${id}` });
			return true;
		} catch (e) {
			if (!ctrl.signal.aborted) toast.error(`Download failed: ${e instanceof Error ? e.message : String(e)}`, { id: `engine-dl-${id}` });
			return false;
		} finally {
			aborts.delete(id);
			const { [id]: _done, ...rest } = _downloads.value;
			_downloads.value = rest;
			await refreshList(false);
		}
	},

	cancelDownload(id: string): void {
		aborts.get(id)?.abort();
	},

	async remove(id: string): Promise<void> {
		await getEngineRegistry().remove(id);
		await refreshList(false);
	},

	async importMaia(file: Blob): Promise<void> {
		await getEngineRegistry().importMaiaModel(file);
		await refreshList(false);
	},

	setDefault(id: string): void {
		updateSettings({ engine: { defaultEngineId: id } });
	},
};

// ── Analysis ──────────────────────────────────────────────────────────────
export function sessionPosition(s: Session): EnginePosition {
	return { fen: s.tree.nodes[ROOT_ID]!.fen, moves: uciPathTo(s.tree, s.cursor) };
}

let analyzer: Analyzer | null = null;
let analyzerEngine: string | null = null;
let analyzerSeq = 0;

function stopAnalyzer(): void {
	analyzerSeq++;
	analyzer?.dispose();
	analyzer = null;
	analyzerEngine = null;
	_analysisLoading.value = false;
}

async function startAnalyzer(engineId: string): Promise<void> {
	stopAnalyzer();
	const seq = analyzerSeq;
	analyzerEngine = engineId;
	batch(() => {
		_analysisLoading.value = true;
		_analysisError.value = null;
		_analysis.value = null;
	});
	try {
		const reg = getEngineRegistry();
		const adapter = await reg.getAdapter(engineId);
		await adapter.init();
		if (seq !== analyzerSeq) return;
		analyzer = new Analyzer({
			adapter,
			getPosition: () => {
				const s = activeSession.peek();
				reg.touch(engineId);
				return s ? sessionPosition(s) : null;
			},
			onUpdate: (st) => {
				if (seq === analyzerSeq) _analysis.value = st;
			},
			onError: (e) => {
				if (seq === analyzerSeq) _analysisError.value = e.message;
			},
			options: { multiPv: _prefs.peek().multiPv },
		});
		_analysisLoading.value = false;
		analyzer.start();
	} catch (e) {
		if (seq !== analyzerSeq) return;
		batch(() => {
			_analysisLoading.value = false;
			_analysisError.value = e instanceof Error ? e.message : String(e);
		});
	}
}

/** Restart the current search (e.g. after a bot cancel stopped the shared adapter). */
function kickAnalyzer(): void {
	analyzer?.setOptions({});
}

export const analysisActions = {
	setEnabled(enabled: boolean): void {
		setPrefs({ enabled });
	},
	toggle(): void {
		setPrefs({ enabled: !_prefs.value.enabled });
	},
	setMultiPv(n: number): void {
		const multiPv = Math.max(MULTIPV_MIN, Math.min(MULTIPV_MAX, Math.round(n)));
		setPrefs({ multiPv });
		analyzer?.setOptions({ multiPv });
	},
	setEngine(id: string | null): void {
		setPrefs({ engineId: id });
	},
};

// ── Bot ───────────────────────────────────────────────────────────────────
interface BotController {
	engineId: string;
	player: BotPlayer | null;
	seq: number;
	configKey: string;
}

const bots = new Map<string, BotController>();
let botSeq = 0;

function setThinking(id: string, v: boolean): void {
	if (!!_thinking.value[id] === v) return;
	const next = { ..._thinking.value };
	if (v) next[id] = true;
	else delete next[id];
	_thinking.value = next;
}

function setBotError(id: string, msg: string | null): void {
	const next = { ..._botErrors.value };
	if (msg) next[id] = msg;
	else delete next[id];
	_botErrors.value = next;
}

function setTip(id: string, nodeId: string | null): void {
	if ((_tips.value[id] ?? null) === nodeId) return;
	const next = { ..._tips.value };
	if (nodeId) next[id] = nodeId;
	else delete next[id];
	_tips.value = next;
}

/** Tip follows moves made at the tip, and any leaf the cursor lands on. */
export function nextTip(s: Session, tip: string | undefined): string {
	if (!tip || !s.tree.nodes[tip]) return s.cursor;
	const node = s.tree.nodes[s.cursor];
	if (!node) return tip;
	if (node.children.length === 0 || node.parentId === tip) return s.cursor;
	return tip;
}

function botConfigOf(b: SessionBotConfig): { color: Color; targetElo: number; think: SessionBotConfig['think']; minDelayMs: number } {
	return { color: b.color, targetElo: b.targetElo, think: b.think, minDelayMs: settings.peek().engine.humanDelayMs };
}

function disposeBot(id: string): void {
	const c = bots.get(id);
	if (!c) return;
	c.seq = -1;
	c.player?.dispose();
	bots.delete(id);
	setThinking(id, false);
	setBotError(id, null);
	kickAnalyzer();
}

function createBot(s: Session): void {
	const bot = s.bot!;
	const c: BotController = { engineId: bot.engineId, player: null, seq: ++botSeq, configKey: JSON.stringify(botConfigOf(bot)) };
	bots.set(s.id, c);
	const sid = s.id;
	void (async () => {
		try {
			const reg = getEngineRegistry();
			const adapter = await reg.getAdapter(bot.engineId);
			if (bots.get(sid) !== c) return;
			adapter.newGame();
			c.player = new BotPlayer({
				adapter,
				config: botConfigOf(bot),
				getPosition: () => {
					const cur = getSession(sid);
					if (!cur || cur.mode !== 'bot' || cur.result || !isAtBotTip(cur)) return null;
					reg.touch(bot.engineId);
					return sessionPosition(cur);
				},
				applyMove: (uci) => {
					sessionsActions.move(uci, sid, { silent: true });
				},
				onThinking: (v) => setThinking(sid, v),
				onError: (e) => {
					setBotError(sid, e.message);
					toast.error(`Bot error: ${e.message}`, { id: `bot-${sid}` });
				},
			});
			setBotError(sid, null);
			c.player.sync();
		} catch (e) {
			if (bots.get(sid) !== c || isAbortError(e)) return;
			const msg = e instanceof Error ? e.message : String(e);
			setBotError(sid, msg);
			toast.error(`Bot unavailable: ${msg}`, { id: `bot-${sid}` });
		}
	})();
}

/** Reconcile controllers with sessions; called on every session change. */
function syncBots(sessions: Session[]): void {
	const live = new Set<string>();
	for (const s of sessions) {
		if (s.mode !== 'bot' || !s.bot) continue;
		live.add(s.id);
		setTip(s.id, nextTip(s, _tips.peek()[s.id]));
		const c = bots.get(s.id);
		if (!c || c.engineId !== s.bot.engineId) {
			if (c) disposeBot(s.id);
			createBot(s);
			continue;
		}
		const cfg = botConfigOf(s.bot);
		const key = JSON.stringify(cfg);
		if (key !== c.configKey) {
			c.configKey = key;
			c.player?.setConfig(cfg);
		} else c.player?.sync();
	}
	for (const id of bots.keys()) {
		if (!live.has(id)) {
			disposeBot(id);
			setTip(id, null);
		}
	}
}

function randomColor(rng: () => number = Math.random): Color {
	return rng() < 0.5 ? 'white' : 'black';
}

export const botActions = {
	/** Attach a bot to a session from its current position (cursor). */
	attach(setup: BotSetup & { userColor?: Color | 'random' }, sessionId?: string): Session | null {
		const s = getSession(sessionId ?? activeSession.value?.id);
		if (!s) return null;
		const { clock, userColor, ...rest } = setup;
		const human: Color = userColor === 'random' ? randomColor() : (userColor ?? (rest.color === 'white' ? 'black' : 'white'));
		const bot: SessionBotConfig = { ...rest, color: human === 'white' ? 'black' : 'white' };
		const turn = turnFromFen(s.tree.nodes[s.cursor]!.fen);
		disposeBot(s.id);
		setTip(s.id, s.cursor);
		setBotError(s.id, null);
		updateSettings({ engine: { defaultElo: bot.targetElo, think: bot.think } });
		return sessionsActions.update({ mode: 'bot', bot, clock: clock ? createClock(clock, turn) : undefined, orientation: human, result: undefined }, s.id);
	},

	/** Back to analysis mode. */
	detach(sessionId?: string): Session | null {
		const s = getSession(sessionId ?? activeSession.value?.id);
		if (!s) return null;
		disposeBot(s.id);
		setTip(s.id, null);
		return sessionsActions.update({ mode: 'analysis', bot: undefined, clock: undefined }, s.id);
	},

	/** Plies a takeback would undo (0 = not possible). */
	takebackPlies(s: Session): number {
		if (s.mode !== 'bot' || !s.bot?.allowTakebacks) return 0;
		const fen = s.tree.nodes[s.cursor]?.fen;
		if (!fen || s.cursor === ROOT_ID) return 0;
		// User's turn → undo bot reply + user move; bot's turn (thinking) → undo the user move only.
		const want = turnFromFen(fen) === s.bot.color ? 1 : 2;
		let n = 0;
		let id: string | null = s.cursor;
		while (n < want && id && id !== ROOT_ID) {
			id = s.tree.nodes[id]?.parentId ?? null;
			n++;
		}
		// Never leave the user on the bot's turn at an older position (bot would replay at once).
		return n === want ? n : 0;
	},

	takeback(sessionId?: string): boolean {
		const s = getSession(sessionId ?? activeSession.value?.id);
		if (!s) return false;
		const n = botActions.takebackPlies(s);
		if (!n) return false;
		bots.get(s.id)?.player?.cancel();
		let target = s.cursor;
		for (let i = 0; i < n; i++) target = s.tree.nodes[target]!.parentId!;
		setTip(s.id, target);
		sessionsActions.goto(target, s.id, { silent: true });
		return true;
	},

	/** Change engine / Elo / think mid-game. */
	updateConfig(patch: Partial<SessionBotConfig>, sessionId?: string): Session | null {
		const s = getSession(sessionId ?? activeSession.value?.id);
		if (!s?.bot) return null;
		return sessionsActions.update({ bot: { ...s.bot, ...patch } }, s.id);
	},
};

// ── Lifecycle ─────────────────────────────────────────────────────────────
let disposers: (() => void)[] = [];

export async function initEngines(): Promise<void> {
	disposeEngines();
	const stored = await getRepositories().kv.get<Partial<AnalysisPrefs>>(ENGINE_PREFS_KEY).catch(() => undefined);
	_prefs.value = { ...DEFAULT_ANALYSIS_PREFS, ...stored };
	loadOpeningIndexRef();
	const reg = getEngineRegistry();

	// Server engines while the server is online.
	let lastRemote: string | null | undefined;
	disposers.push(
		effect(() => {
			const online = serverConnector.status.value === 'online';
			const url = online ? serverConnector.url.value : null;
			if (url === lastRemote) return;
			lastRemote = url;
			untracked(() => {
				if (url) reg.setRemote({ listEngines: () => api.engines() }, { serverUrl: url, token: () => accessToken() ?? undefined });
				else reg.setRemote(null, null);
				void refreshList(!!url);
			});
		}),
	);

	// Analysis follows the toggle, the analysis engine and the active session.
	disposers.push(
		effect(() => {
			const { enabled } = _prefs.value;
			const s = activeSession.value;
			const engineId = analysisEngineId.value;
			untracked(() => {
				if (!enabled || !s) {
					if (analyzer || analyzerEngine) stopAnalyzer();
					if (!enabled) {
						_analysis.value = null;
						_analysisError.value = null;
					}
					return;
				}
				if (analyzerEngine !== engineId) void startAnalyzer(engineId);
				else analyzer?.sync();
			});
		}),
	);

	// Bots follow sessions in 'bot' mode (any session, active or not).
	disposers.push(
		effect(() => {
			const list = openSessions.value;
			untracked(() => syncBots(list));
		}),
	);
}

export function disposeEngines(): void {
	disposers.forEach((d) => d());
	disposers = [];
	stopAnalyzer();
	for (const id of bots.keys()) disposeBot(id);
}

/** Test helper: reset in-memory state. */
export function resetEnginesState(): void {
	disposeEngines();
	batch(() => {
		_entries.value = [];
		_loaded.value = false;
		_downloads.value = {};
		_prefs.value = DEFAULT_ANALYSIS_PREFS;
		_analysis.value = null;
		_analysisError.value = null;
		_thinking.value = {};
		_botErrors.value = {};
		_tips.value = {};
	});
}

defineStore({
	name: 'engines',
	init: initEngines,
	dispose: disposeEngines,
});

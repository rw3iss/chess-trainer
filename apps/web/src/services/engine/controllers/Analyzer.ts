import {
	scoreToWinProbability,
	toWhitePov,
	turnFromFen,
	type EngineAdapter,
	type EngineInfo,
	type EnginePosition,
	type EngineScore,
	type Uci,
} from '@chess/core';
import { fenAfter } from '../util';

export interface AnalysisLine {
	multipv: number;
	depth: number;
	/** White point of view. */
	score: EngineScore;
	/** White win probability 0..1. */
	winProbability: number;
	pv: Uci[];
	policy?: number;
}

export interface AnalysisState {
	/** FEN being analysed (after the moves). */
	fen: string;
	/** Sorted by multipv (1 = best). */
	lines: AnalysisLine[];
	depth: number;
	nodes?: number;
	nps?: number;
	running: boolean;
	/** True while paused because the document is hidden. */
	paused: boolean;
}

export interface AnalyzerOptions {
	multiPv: number;
	/** Wait this long after a position change before restarting the search. Default 150 ms. */
	debounceMs?: number;
	/** Coalesce info updates to at most one emit per this many ms. Default 100 ms. */
	throttleMs?: number;
	/** Optional search bound (default infinite). */
	depth?: number;
	movetimeMs?: number;
}

export interface AnalyzerDeps {
	adapter: EngineAdapter;
	getPosition: () => EnginePosition | null;
	onUpdate: (state: AnalysisState) => void;
	options: AnalyzerOptions;
	/** Visibility source; defaults to `document` when present. Pass null to disable pausing. */
	visibility?: { hidden: boolean; addEventListener(t: 'visibilitychange', fn: () => void): void; removeEventListener(t: 'visibilitychange', fn: () => void): void } | null;
	onError?: (err: Error) => void;
}

/**
 * Continuous MultiPV analysis of the current position. Call `sync()` after
 * every position change (debounced); scores are normalised to White's POV.
 * Pauses while the document is hidden and resumes when visible.
 *
 *   const an = new Analyzer({ adapter, getPosition, onUpdate: s => evalSignal.value = s, options: { multiPv: 3 } });
 *   an.start(); …; an.sync(); …; an.dispose();
 */
export class Analyzer {
	private opts: AnalyzerOptions;
	private active = false;
	private paused = false;
	private stopSearch: (() => void) | null = null;
	private debounce: ReturnType<typeof setTimeout> | null = null;
	private throttle: ReturnType<typeof setTimeout> | null = null;
	private state: AnalysisState | null = null;
	private key = '';
	private gen = 0;
	private readonly vis: AnalyzerDeps['visibility'];
	private readonly onVisibility = (): void => this.handleVisibility();

	constructor(private readonly deps: AnalyzerDeps) {
		this.opts = { ...deps.options };
		this.vis = deps.visibility !== undefined ? deps.visibility : typeof document !== 'undefined' ? document : null;
	}

	get running(): boolean {
		return this.active;
	}

	get current(): AnalysisState | null {
		return this.state;
	}

	start(): void {
		if (this.active) return;
		this.active = true;
		this.vis?.addEventListener('visibilitychange', this.onVisibility);
		this.paused = !!this.vis?.hidden;
		this.restart(true);
	}

	/** Stops analysis (keeps the last state). */
	stop(): void {
		if (!this.active) return;
		this.active = false;
		this.vis?.removeEventListener('visibilitychange', this.onVisibility);
		this.halt();
		if (this.state) this.emit({ ...this.state, running: false, paused: false });
	}

	/** Position changed: restart (debounced) if the position differs. */
	sync(): void {
		if (!this.active) return;
		const pos = this.deps.getPosition();
		const key = pos ? `${pos.fen}|${pos.moves.join(' ')}` : '';
		if (key === this.key) return;
		this.halt();
		if (this.debounce) clearTimeout(this.debounce);
		this.debounce = setTimeout(() => {
			this.debounce = null;
			this.restart(true);
		}, this.opts.debounceMs ?? 150);
	}

	setOptions(patch: Partial<AnalyzerOptions>): void {
		this.opts = { ...this.opts, ...patch };
		if (this.active) this.restart(true);
	}

	dispose(): void {
		this.stop();
		if (this.debounce) clearTimeout(this.debounce);
		this.debounce = null;
	}

	// ── internals ────────────────────────────────────────────────────────

	private halt(): void {
		this.gen++;
		this.stopSearch?.();
		this.stopSearch = null;
		if (this.throttle) clearTimeout(this.throttle);
		this.throttle = null;
	}

	private handleVisibility(): void {
		const hidden = !!this.vis?.hidden;
		if (hidden === this.paused) return;
		this.paused = hidden;
		if (hidden) {
			this.halt();
			if (this.state) this.emit({ ...this.state, running: false, paused: true });
		} else {
			this.restart(false);
		}
	}

	private restart(resetLines: boolean): void {
		this.halt();
		if (!this.active) return;
		const pos = this.deps.getPosition();
		this.key = pos ? `${pos.fen}|${pos.moves.join(' ')}` : '';
		const fen = pos ? fenAfter(pos) : null;
		if (!pos || !fen) {
			this.state = null;
			return;
		}
		if (resetLines || !this.state || this.state.fen !== fen) {
			this.state = { fen, lines: [], depth: 0, running: false, paused: this.paused };
		}
		if (this.paused) {
			this.emit({ ...this.state, running: false, paused: true });
			return;
		}
		const turn = turnFromFen(fen);
		const gen = this.gen;
		const lines = new Map<number, AnalysisLine>(this.state.lines.map((l) => [l.multipv, l]));
		const st = this.state;
		st.running = true;
		st.paused = false;
		this.emit({ ...st });
		const onInfo = (info: EngineInfo): void => {
			if (gen !== this.gen || !info.pv.length) return;
			const score = toWhitePov(info.score, turn);
			const line: AnalysisLine = { multipv: info.multipv, depth: info.depth, score, winProbability: scoreToWinProbability(score), pv: info.pv };
			if (info.policy !== undefined) line.policy = info.policy;
			lines.set(info.multipv, line);
			for (const k of lines.keys()) if (k > this.opts.multiPv) lines.delete(k);
			st.lines = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
			if (info.multipv === 1) {
				st.depth = info.depth;
				if (info.nodes !== undefined) st.nodes = info.nodes;
				if (info.nps !== undefined) st.nps = info.nps;
			}
			this.scheduleEmit(gen);
		};
		try {
			const analyzeOpts: { multiPv: number; infinite?: boolean; depth?: number; movetimeMs?: number } = { multiPv: this.opts.multiPv };
			if (this.opts.depth !== undefined) analyzeOpts.depth = this.opts.depth;
			if (this.opts.movetimeMs !== undefined) analyzeOpts.movetimeMs = this.opts.movetimeMs;
			if (analyzeOpts.depth === undefined && analyzeOpts.movetimeMs === undefined) analyzeOpts.infinite = true;
			this.stopSearch = this.deps.adapter.analyze(pos, analyzeOpts, onInfo);
		} catch (err) {
			st.running = false;
			this.emit({ ...st });
			this.deps.onError?.(err instanceof Error ? err : new Error(String(err)));
		}
	}

	private scheduleEmit(gen: number): void {
		if (this.throttle) return;
		this.throttle = setTimeout(() => {
			this.throttle = null;
			if (gen === this.gen && this.state) this.emit({ ...this.state });
		}, this.opts.throttleMs ?? 100);
	}

	private emit(s: AnalysisState): void {
		this.deps.onUpdate(s);
	}
}

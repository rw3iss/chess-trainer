import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
	applyUci,
	buildGoCommand,
	buildPositionCommand,
	INITIAL_FEN,
	pickBlunderMove,
	resolveStrength,
	type EngineBestMovePayload,
	type EngineGoPayload,
	type EngineInfo,
	type EngineInfoPayload,
	type EnginePosition,
	type EnginePositionPayload,
	type EngineStartResult,
	type GoLimits,
} from '@chess/core';
import { WsError } from '../../common/ws/ws.util';
import { PoolExhaustedError } from './engine-pool';
import type { EngineSpec } from './engine-specs';
import { EnginesService } from './engines.service';
import type { UciProcess } from './uci-process';

/** Callbacks the gateway provides so the service never touches sockets. */
export interface EngineSink {
	info(p: EngineInfoPayload): void;
	bestmove(p: EngineBestMovePayload): void;
	error(engineSessionId: string, message: string): void;
	closed(engineSessionId: string, reason: string): void;
}

interface EngineSession {
	id: string;
	owner: string;
	spec: EngineSpec;
	proc: UciProcess;
	position: EnginePosition;
	sink: EngineSink;
	/** Increments per `go`; stale results from a superseded search are dropped. */
	searchSeq: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Engine sessions for the `/engine` namespace: one pooled UCI process per
 * session, owned by a socket. Implements play (strength plan + blunder blend +
 * minimum delay) and streaming analysis.
 */
@Injectable()
export class EngineSessionsService {
	private readonly sessions = new Map<string, EngineSession>();

	constructor(private readonly engines: EnginesService) {}

	/** Starts a session for `engineId`. Enforces per-socket quota and the global process cap. */
	async start(owner: string, engineId: string, sink: EngineSink): Promise<EngineStartResult> {
		const spec = this.engines.spec(engineId);
		if (!spec) throw new WsError('NOT_FOUND', `unknown engine '${engineId}'`);
		if (!spec.available) throw new WsError('UNAVAILABLE', spec.reason ?? 'engine unavailable');
		if (this.ownedBy(owner).length >= this.engines.cfg.maxPerSocket) {
			throw new WsError('QUOTA', `max ${this.engines.cfg.maxPerSocket} engine sessions per connection`);
		}
		let proc: UciProcess;
		try {
			proc = await this.engines.pool.acquire(spec, owner);
		} catch (err) {
			if (err instanceof PoolExhaustedError) throw new WsError('BUSY', err.message);
			throw new WsError('ENGINE_FAILED', (err as Error).message);
		}
		const id = randomUUID();
		const session: EngineSession = { id, owner, spec, proc, position: { fen: INITIAL_FEN, moves: [] }, sink, searchSeq: 0 };
		const onExit = (): void => {
			if (this.sessions.delete(id)) sink.closed(id, 'engine process exited');
		};
		proc.once('exit', onExit);
		this.sessions.set(id, session);
		return { engineSessionId: id, meta: spec.meta };
	}

	setPosition(owner: string, p: EnginePositionPayload): void {
		const s = this.get(owner, p.engineSessionId);
		if (typeof p.fen !== 'string' || !Array.isArray(p.moves)) throw new WsError('BAD_REQUEST', 'fen and moves[] required');
		s.position = { fen: p.fen, moves: p.moves.map(String) };
	}

	/**
	 * Starts a search. Returns immediately; results arrive through the sink
	 * (`info` while analyzing, `bestmove` at the end).
	 */
	go(owner: string, p: EngineGoPayload): void {
		const s = this.get(owner, p.engineSessionId);
		const seq = ++s.searchSeq;
		const run = p.mode === 'play' ? this.play(s, p, seq) : this.analyze(s, p, seq);
		run.catch((err: Error) => {
			if (seq === s.searchSeq) s.sink.error(s.id, err.message);
		});
	}

	stop(owner: string, engineSessionId: string): void {
		this.get(owner, engineSessionId).proc.stop();
	}

	close(owner: string, engineSessionId: string): void {
		const s = this.get(owner, engineSessionId);
		this.sessions.delete(s.id);
		s.proc.removeAllListeners('exit');
		this.engines.pool.release(s.proc);
	}

	/** Disconnect: drop every session and kill its process. */
	closeOwner(owner: string): void {
		for (const s of this.ownedBy(owner)) {
			this.sessions.delete(s.id);
			s.proc.removeAllListeners('exit');
		}
		this.engines.pool.releaseOwner(owner);
	}

	private async play(s: EngineSession, p: EngineGoPayload, seq: number): Promise<void> {
		if (!p.play?.think) throw new WsError('BAD_REQUEST', 'play.think required');
		const started = Date.now();
		const plan = resolveStrength(s.spec.meta, p.play.targetElo, p.play.think);
		const options: Record<string, string | number | boolean> = { ...plan.options };
		if (s.spec.maiaWeights && plan.ratingBucket !== undefined) {
			const file = this.nearestWeights(s.spec.maiaWeights, plan.ratingBucket);
			if (file) options.WeightsFile = file;
			if (plan.temperature !== undefined) options.Temperature = plan.temperature;
		}
		s.proc.setOptions(options);
		await s.proc.isReady();
		const res = await s.proc.go(buildPositionCommand(s.position), buildGoCommand(plan.go));
		const fen = this.fenAfter(s.position);
		const uci = fen ? pickBlunderMove(fen, res.uci, plan.blunderChance) : res.uci;
		const wait = plan.minDelayMs - (Date.now() - started);
		if (wait > 0) await sleep(wait);
		if (seq !== s.searchSeq || !this.sessions.has(s.id)) return;
		const out: EngineBestMovePayload = { engineSessionId: s.id, uci };
		if (res.info && uci === res.uci) out.info = res.info;
		s.sink.bestmove(out);
	}

	private async analyze(s: EngineSession, p: EngineGoPayload, seq: number): Promise<void> {
		const a = p.analyze ?? { multiPv: 1, infinite: true };
		const multiPv = Math.max(1, Math.min(10, Math.floor(a.multiPv || 1)));
		// Full strength for analysis.
		s.proc.setOptions({ MultiPV: multiPv, UCI_LimitStrength: false, 'UCI LimitStrength': false, 'Skill Level': 20 });
		await s.proc.isReady();
		const limits: GoLimits = { depth: a.depth, movetimeMs: a.movetimeMs, infinite: a.infinite };
		if (a.depth === undefined && a.movetimeMs === undefined) limits.infinite = true;
		const onInfo = (info: EngineInfo): void => {
			if (seq === s.searchSeq && info.pv.length) s.sink.info({ engineSessionId: s.id, info });
		};
		const res = await s.proc.go(buildPositionCommand(s.position), buildGoCommand(limits), onInfo);
		if (seq !== s.searchSeq || !this.sessions.has(s.id)) return;
		s.sink.bestmove({ engineSessionId: s.id, uci: res.uci, info: res.info });
	}

	private fenAfter(pos: EnginePosition): string | null {
		let fen = pos.fen;
		for (const m of pos.moves) {
			const r = applyUci(fen, m);
			if (!r) return null;
			fen = r.fen;
		}
		return fen;
	}

	private nearestWeights(weights: Map<number, string>, bucket: number): string | undefined {
		let best: [number, string] | undefined;
		for (const [r, f] of weights) if (!best || Math.abs(r - bucket) < Math.abs(best[0] - bucket)) best = [r, f];
		return best?.[1];
	}

	private ownedBy(owner: string): EngineSession[] {
		return [...this.sessions.values()].filter((s) => s.owner === owner);
	}

	private get(owner: string, id: string): EngineSession {
		const s = this.sessions.get(id);
		if (!s || s.owner !== owner) throw new WsError('NOT_FOUND', 'unknown engine session');
		return s;
	}
}

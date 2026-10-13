/** UCI protocol helpers: parse engine output, build commands, score utilities. */
import { randomLegalMove } from '../chess/position.js';
import { INITIAL_FEN, type Color, type Uci } from '../chess/types.js';
import type { EngineInfo, EnginePosition, EngineScore, GoLimits } from './types.js';

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

const int = (s: string | undefined): number | undefined => {
	if (s === undefined) return undefined;
	const n = Number.parseInt(s, 10);
	return Number.isFinite(n) ? n : undefined;
};

/**
 * Parse an `info …` line. Returns null for lines without a score (e.g.
 * `info string …`, `info currmove …`, `info depth 5` only) or non-info lines.
 */
export function parseInfoLine(line: string): EngineInfo | null {
	const t = line.trim().split(/\s+/);
	if (t[0] !== 'info' || t[1] === 'string') return null;
	const info: EngineInfo = { depth: 0, multipv: 1, score: {}, pv: [] };
	let hasScore = false;
	for (let i = 1; i < t.length; i++) {
		const tok = t[i];
		switch (tok) {
			case 'depth':
				info.depth = int(t[++i]) ?? 0;
				break;
			case 'seldepth':
				info.seldepth = int(t[++i]);
				break;
			case 'multipv':
				info.multipv = int(t[++i]) ?? 1;
				break;
			case 'nodes':
				info.nodes = int(t[++i]);
				break;
			case 'nps':
				info.nps = int(t[++i]);
				break;
			case 'time':
				info.timeMs = int(t[++i]);
				break;
			case 'score': {
				const kind = t[i + 1];
				const val = int(t[i + 2]);
				if ((kind === 'cp' || kind === 'mate') && val !== undefined) {
					info.score = kind === 'cp' ? { cp: val } : { mate: val };
					hasScore = true;
					i += 2;
					const b = t[i + 1];
					if (b === 'lowerbound' || b === 'upperbound') {
						info.score.bound = b === 'lowerbound' ? 'lower' : 'upper';
						i++;
					}
				} else {
					i += 1;
				}
				break;
			}
			case 'wdl':
				i += 3;
				break;
			case 'currmove':
			case 'currmovenumber':
			case 'hashfull':
			case 'tbhits':
			case 'cpuload':
			case 'sbhits':
				i++;
				break;
			case 'pv':
				info.pv = t.slice(i + 1).filter((m) => UCI_MOVE.test(m));
				i = t.length;
				break;
			case 'string':
				i = t.length;
				break;
			default:
				break;
		}
	}
	return hasScore ? info : null;
}

/** Parse `bestmove e2e4 [ponder e7e5]`. Null for non-bestmove lines and `(none)` / `0000`. */
export function parseBestMove(line: string): { uci: Uci; ponder?: Uci } | null {
	const t = line.trim().split(/\s+/);
	if (t[0] !== 'bestmove' || !t[1] || !UCI_MOVE.test(t[1])) return null;
	const res: { uci: Uci; ponder?: Uci } = { uci: t[1] };
	if (t[2] === 'ponder' && t[3] && UCI_MOVE.test(t[3])) res.ponder = t[3];
	return res;
}

export function buildPositionCommand(pos: EnginePosition): string {
	const base = pos.fen.trim() === INITIAL_FEN ? 'position startpos' : `position fen ${pos.fen.trim()}`;
	return pos.moves.length ? `${base} moves ${pos.moves.join(' ')}` : base;
}

/** `go …` from limits. No limits (or `infinite`) → `go infinite`. MultiPV is a setoption — see `setOptionCommands`. */
export function buildGoCommand(go: GoLimits): string {
	if (go.infinite) return 'go infinite';
	const parts = ['go'];
	if (go.depth !== undefined) parts.push('depth', String(Math.max(1, Math.round(go.depth))));
	if (go.nodes !== undefined) parts.push('nodes', String(Math.max(1, Math.round(go.nodes))));
	if (go.movetimeMs !== undefined) parts.push('movetime', String(Math.max(1, Math.round(go.movetimeMs))));
	return parts.length === 1 ? 'go infinite' : parts.join(' ');
}

export function setOptionCommands(options: Record<string, string | number | boolean>): string[] {
	return Object.entries(options).map(([name, value]) => `setoption name ${name} value ${String(value)}`);
}

/** Convert a side-to-move score to White's point of view. */
export function toWhitePov(score: EngineScore, turn: Color): EngineScore {
	if (turn === 'white') return { ...score };
	const out: EngineScore = {};
	if (score.cp !== undefined) out.cp = score.cp === 0 ? 0 : -score.cp;
	if (score.mate !== undefined) out.mate = score.mate === 0 ? 0 : -score.mate;
	if (score.bound) out.bound = score.bound === 'lower' ? 'upper' : 'lower';
	return out;
}

/** White win probability 0..1 from a White-POV score (Lichess logistic on cp). */
export function scoreToWinProbability(score: EngineScore): number {
	if (score.mate !== undefined) return score.mate > 0 ? 1 : 0;
	const cp = score.cp ?? 0;
	return 1 / (1 + Math.exp(-0.00368208 * cp));
}

/** '+1.23', '-0.40', '0.00', '#3', '-#2'. */
export function formatScore(score: EngineScore): string {
	if (score.mate !== undefined) return score.mate < 0 ? `-#${-score.mate}` : `#${score.mate}`;
	const cp = score.cp ?? 0;
	if (cp === 0) return '0.00';
	return (cp > 0 ? '+' : '-') + (Math.abs(cp) / 100).toFixed(2);
}

/** With probability `chance`, replace the engine move by a random legal move that does not allow mate-in-1 (when avoidable). */
export function pickBlunderMove(fen: string, bestUci: Uci, chance: number, rng: () => number = Math.random): Uci {
	if (chance <= 0 || rng() >= chance) return bestUci;
	return randomLegalMove(fen, rng, { avoidMateIn1: true }) ?? bestUci;
}

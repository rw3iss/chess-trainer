// Pure helpers: engine PV (UCI) → numbered SAN tokens, scores → labels, arrows.
import { applyUci, type Uci } from '@chess/core/chess';
import { formatScore, type EngineScore } from '@chess/core/engine';
import type { Arrow } from '@/components/board';
import type { AnalysisLine } from '@/services/engine';

export interface PvToken {
	uci: Uci;
	san: string;
	/** '12.' before White moves, '12…' when the line starts with Black, else ''. */
	prefix: string;
	/** FEN after this move. */
	fen: string;
}

/** Converts a UCI PV to SAN tokens with move numbers (stops at the first illegal move). */
export function pvToSan(fen: string, pv: Uci[], maxPlies = pv.length): PvToken[] {
	const parts = fen.split(' ');
	let white = parts[1] !== 'b';
	let num = Number(parts[5]) || 1;
	let cur = fen;
	const out: PvToken[] = [];
	for (const uci of pv.slice(0, maxPlies)) {
		const r = applyUci(cur, uci);
		if (!r) break;
		const prefix = white ? `${num}.` : out.length === 0 ? `${num}…` : '';
		out.push({ uci: r.uci, san: r.san, prefix, fen: r.fen });
		if (!white) num++;
		white = !white;
		cur = r.fen;
	}
	return out;
}

/** '+1.23' / '#3' / '-#2'; 0 cp → '0.00'. */
export function scoreLabel(score: EngineScore): string {
	return formatScore(score);
}

/** Short bar label: '+1.2', '#3', 'M-2' style kept from formatScore but 1 decimal. */
export function evalBarLabel(score: EngineScore): string {
	if (score.mate !== undefined) return formatScore(score);
	const cp = score.cp ?? 0;
	const v = Math.abs(cp) / 100;
	const text = v >= 10 ? v.toFixed(0) : v.toFixed(1);
	if (Number(text) === 0) return '0.0';
	return `${cp > 0 ? '+' : '-'}${text}`;
}

/** 1 234 567 → '1.2M'; 12 345 → '12k'. */
export function compactNumber(n: number | undefined): string {
	if (n === undefined) return '–';
	if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
	return String(n);
}

export const ENGINE_ARROW_COLOR = 'var(--engine-arrow, var(--color-info))';

/** First move of each line as an arrow: best opaque, the rest fading. `focus` = hovered multipv. */
export function linesToArrows(lines: AnalysisLine[], focus?: number | null, color = ENGINE_ARROW_COLOR): Arrow[] {
	const out: Arrow[] = [];
	for (const [i, l] of lines.entries()) {
		const uci = l.pv[0];
		if (!uci || uci.length < 4) continue;
		const isFocus = focus === l.multipv;
		if (focus != null && !isFocus) continue;
		const opacity = isFocus || i === 0 ? 0.9 : Math.max(0.25, 0.55 - (i - 1) * 0.12);
		// Strongest drawn last (on top).
		out.unshift({ from: uci.slice(0, 2), to: uci.slice(2, 4), color, opacity });
	}
	return out;
}

import type { Color, SquareName } from '@chess/core';
import type { Arrow, Mark } from '../types';
import { squareToCell, squareToIdx } from './geometry';

/** Arrow geometry in square units (board viewBox 0 0 8 8). */
export interface ArrowGeometry {
	/** Shaft polyline path (stroke it). */
	shaft: string;
	/** Arrow head triangle path (fill it). */
	head: string;
}

const HEAD_LEN = 0.42;
const HEAD_HALF = 0.3;
const START_OFFSET = 0.18;

function isKnightJump(from: SquareName, to: SquareName): boolean {
	const a = squareToIdx(from);
	const b = squareToIdx(to);
	const df = Math.abs(a.file - b.file);
	const dr = Math.abs(a.rank - b.rank);
	return (df === 1 && dr === 2) || (df === 2 && dr === 1);
}

const fmt = (n: number): string => (Math.round(n * 1000) / 1000).toString();

export function arrowGeometry(from: SquareName, to: SquareName, orientation: Color): ArrowGeometry {
	const a = squareToCell(from, orientation);
	const b = squareToCell(to, orientation);
	const start = { x: a.x + 0.5, y: a.y + 0.5 };
	const end = { x: b.x + 0.5, y: b.y + 0.5 };
	const points = [start];
	if (isKnightJump(from, to)) {
		// L-shape: long leg first.
		const long = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? 'x' : 'y';
		points.push(long === 'x' ? { x: end.x, y: start.y } : { x: start.x, y: end.y });
	}
	points.push(end);

	// Pull the start off the piece centre, end at the head base.
	const p0 = points[0];
	const p1 = points[1];
	const d0 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
	points[0] = { x: p0.x + ((p1.x - p0.x) / d0) * START_OFFSET, y: p0.y + ((p1.y - p0.y) / d0) * START_OFFSET };

	const last = points[points.length - 1];
	const prev = points[points.length - 2];
	const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
	const ux = (last.x - prev.x) / len;
	const uy = (last.y - prev.y) / len;
	const tip = { x: last.x - ux * 0.08, y: last.y - uy * 0.08 };
	const base = { x: tip.x - ux * HEAD_LEN, y: tip.y - uy * HEAD_LEN };
	points[points.length - 1] = { x: base.x + ux * 0.02, y: base.y + uy * 0.02 };

	const shaft = points.map((p, i) => `${i ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`).join(' ');
	const nx = -uy;
	const ny = ux;
	const head =
		`M${fmt(tip.x)} ${fmt(tip.y)} ` +
		`L${fmt(base.x + nx * HEAD_HALF)} ${fmt(base.y + ny * HEAD_HALF)} ` +
		`L${fmt(base.x - nx * HEAD_HALF)} ${fmt(base.y - ny * HEAD_HALF)} Z`;
	return { shaft, head };
}

/** Brush colours for user-drawn shapes (lichess convention: modifier keys pick). */
export const BRUSHES = {
	green: 'rgba(21, 120, 27, 0.8)',
	red: 'rgba(200, 30, 30, 0.8)',
	blue: 'rgba(0, 48, 136, 0.8)',
	yellow: 'rgba(230, 160, 0, 0.85)',
} as const;

export function brushFor(e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): string | undefined {
	if (e.shiftKey && (e.altKey || e.ctrlKey)) return BRUSHES.yellow;
	if (e.shiftKey) return BRUSHES.red;
	if (e.altKey || e.ctrlKey || e.metaKey) return BRUSHES.blue;
	return undefined; // theme arrow colour
}

/** Toggle a user arrow: same from/to (and colour) removes it, otherwise adds/replaces. */
export function toggleArrow(arrows: Arrow[], next: Arrow): Arrow[] {
	const i = arrows.findIndex((a) => a.from === next.from && a.to === next.to);
	if (i === -1) return [...arrows, next];
	if (arrows[i].color === next.color) return arrows.filter((_, j) => j !== i);
	return arrows.map((a, j) => (j === i ? next : a));
}

export function toggleMark(marks: Mark[], next: Mark): Mark[] {
	const i = marks.findIndex((m) => m.square === next.square && m.kind === next.kind);
	if (i === -1) return [...marks, next];
	if (marks[i].color === next.color) return marks.filter((_, j) => j !== i);
	return marks.map((m, j) => (j === i ? next : m));
}

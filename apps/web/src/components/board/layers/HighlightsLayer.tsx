import { memo } from 'preact/compat';
import type { JSX } from 'preact';
import type { Color, SquareName } from '@chess/core';
import type { Mark } from '../types';
import { cellTransform, squareToCell } from '../lib/geometry';

interface Props {
	orientation: Color;
	lastMove?: [SquareName, SquareName];
	selected: SquareName | null;
	check?: SquareName;
	/** Legal destinations of the selected piece. */
	dests: readonly SquareName[];
	/** Squares currently occupied (dests there render as capture rings). */
	occupied: ReadonlySet<SquareName>;
	premove?: [SquareName, SquareName];
	marks: readonly Mark[];
	focus: SquareName | null;
}

function Sq({ sq, orientation, cls, style }: { sq: SquareName; orientation: Color; cls: string; style?: JSX.CSSProperties }) {
	return <div class={`board__hl ${cls}`} style={{ transform: cellTransform(squareToCell(sq, orientation)), ...style }} />;
}

export const HighlightsLayer = memo(function HighlightsLayer(p: Props) {
	const o = p.orientation;
	const out: JSX.Element[] = [];
	if (p.lastMove) {
		out.push(<Sq key="lm-f" sq={p.lastMove[0]} orientation={o} cls="board__hl--last" />);
		out.push(<Sq key="lm-t" sq={p.lastMove[1]} orientation={o} cls="board__hl--last" />);
	}
	if (p.premove) {
		out.push(<Sq key="pm-f" sq={p.premove[0]} orientation={o} cls="board__hl--premove" />);
		out.push(<Sq key="pm-t" sq={p.premove[1]} orientation={o} cls="board__hl--premove" />);
	}
	for (const m of p.marks) {
		if (m.kind === 'highlight') {
			out.push(<Sq key={`mk-${m.square}`} sq={m.square} orientation={o} cls="board__hl--mark" style={m.color ? { background: m.color } : undefined} />);
		}
	}
	if (p.selected) out.push(<Sq key="sel" sq={p.selected} orientation={o} cls="board__hl--selected" />);
	if (p.check) out.push(<Sq key="chk" sq={p.check} orientation={o} cls="board__hl--check" />);
	for (const d of p.dests) {
		out.push(<Sq key={`d-${d}`} sq={d} orientation={o} cls={p.occupied.has(d) ? 'board__hl--capture' : 'board__hl--dest'} />);
	}
	if (p.focus) out.push(<Sq key="focus" sq={p.focus} orientation={o} cls="board__hl--focus" />);
	return <div class="board__highlights" aria-hidden="true">{out}</div>;
});

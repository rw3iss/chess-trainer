import { memo } from 'preact/compat';
import type { JSX } from 'preact';
import type { Color } from '@chess/core';
import type { Arrow, Mark } from '../types';
import { arrowGeometry } from '../lib/shapes';
import { squareToCell } from '../lib/geometry';

interface Props {
	orientation: Color;
	arrows: readonly Arrow[];
	marks: readonly Mark[];
	/** In-progress right-drag shape. */
	preview?: Arrow | null;
}

function ArrowShape({ arrow, orientation, preview }: { arrow: Arrow; orientation: Color; preview?: boolean }) {
	const g = arrowGeometry(arrow.from, arrow.to, orientation);
	const color = arrow.color ?? 'var(--board-arrow)';
	return (
		<g class={`board__arrow${preview ? ' board__arrow--preview' : ''}`} style={{ opacity: arrow.opacity ?? 1, color }}>
			<path class="board__arrow-shaft" d={g.shaft} />
			<path class="board__arrow-head" d={g.head} />
		</g>
	);
}

function MarkShape({ mark, orientation }: { mark: Mark; orientation: Color }) {
	const c = squareToCell(mark.square, orientation);
	const color = mark.color ?? 'var(--board-arrow)';
	if (mark.kind === 'dot') return <circle class="board__mark board__mark--dot" cx={c.x + 0.5} cy={c.y + 0.5} r={0.16} style={{ color }} />;
	return <circle class="board__mark board__mark--circle" cx={c.x + 0.5} cy={c.y + 0.5} r={0.44} style={{ color }} />;
}

export const ShapesLayer = memo(function ShapesLayer({ orientation, arrows, marks, preview }: Props) {
	const shapes: JSX.Element[] = [];
	marks.forEach((m, i) => {
		if (m.kind !== 'highlight') shapes.push(<MarkShape key={`m${i}-${m.square}`} mark={m} orientation={orientation} />);
	});
	arrows.forEach((a, i) => {
		if (a.from !== a.to) shapes.push(<ArrowShape key={`a${i}-${a.from}${a.to}`} arrow={a} orientation={orientation} />);
	});
	if (preview) {
		shapes.push(
			preview.from === preview.to ? (
				<MarkShape key="pv" mark={{ square: preview.from, kind: 'circle', color: preview.color }} orientation={orientation} />
			) : (
				<ArrowShape key="pv" arrow={preview} orientation={orientation} preview />
			),
		);
	}
	if (!shapes.length) return null;
	return (
		<svg class="board__shapes" viewBox="0 0 8 8" aria-hidden="true">
			{shapes}
		</svg>
	);
});

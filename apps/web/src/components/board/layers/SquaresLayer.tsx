import { memo } from 'preact/compat';
import type { JSX } from 'preact';

/** 64 squares as one static SVG (independent of orientation: top-left is always light). */
export const SquaresLayer = memo(function SquaresLayer() {
	const dark: JSX.Element[] = [];
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			if ((x + y) % 2 === 1) dark.push(<rect key={y * 8 + x} x={x} y={y} width={1} height={1} />);
		}
	}
	return (
		<svg class="board__squares" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true" shape-rendering="crispEdges">
			<rect class="board__squares-light" width={8} height={8} />
			<g class="board__squares-dark">{dark}</g>
		</svg>
	);
});

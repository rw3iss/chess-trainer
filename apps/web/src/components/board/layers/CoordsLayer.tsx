import { memo } from 'preact/compat';
import type { Color } from '@chess/core';
import { FILES, RANKS } from '../lib/geometry';

interface Props {
	orientation: Color;
	mode: 'inside' | 'outside' | 'none';
}

/** File letters + rank numbers. Inside: in square corners, coloured against the square. */
export const CoordsLayer = memo(function CoordsLayer({ orientation, mode }: Props) {
	if (mode === 'none') return null;
	const files = orientation === 'white' ? FILES : [...FILES].reverse();
	const ranks = orientation === 'white' ? [...RANKS].reverse() : RANKS;
	return (
		<div class={`board__coords board__coords--${mode}`} aria-hidden="true">
			{files.map((f, x) => (
				<span
					key={f}
					class={`board__coord board__coord--file ${mode === 'inside' && x % 2 === 0 ? 'board__coord--on-dark' : 'board__coord--on-light'}`}
					style={{ left: `${x * 12.5}%` }}
				>
					{f}
				</span>
			))}
			{ranks.map((r, y) => (
				<span
					key={r}
					class={`board__coord board__coord--rank ${mode === 'inside' && y % 2 === 1 ? 'board__coord--on-dark' : 'board__coord--on-light'}`}
					style={{ top: `${y * 12.5}%` }}
				>
					{r}
				</span>
			))}
		</div>
	);
});

import { memo } from 'preact/compat';
import type { JSX } from 'preact';
import type { BoardTexture } from '@chess/core/theme';

/**
 * Procedural board texture drawn as a neutral-grey luminance overlay. The layer
 * is blended onto the squares with `mix-blend-mode` (see Board2D.scss) so it
 * tints with ANY light/dark colour. Coordinates are a fixed 800×800 space (one
 * square = 100 units), so the pattern scales with the board.
 */

let instance = 0;

const SIZE = 800;

const GREY = '0.333 0.333 0.333 0 0  0.333 0.333 0.333 0 0  0.333 0.333 0.333 0 0  0 0 0 0 1';

interface Props {
	texture: BoardTexture;
}

/** Mask covering only the dark (or light) squares, for per-colour grain direction. */
function SquareMask({ id, dark }: { id: string; dark: boolean }) {
	const rects: JSX.Element[] = [];
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			// Display cell (x,y): top-left (0,0) is a light square in both orientations.
			const isDark = (x + y) % 2 === 1;
			if (isDark === dark) rects.push(<rect key={`${x}${y}`} x={x * 100} y={y * 100} width={100} height={100} fill="#fff" />);
		}
	}
	return <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={SIZE} height={SIZE}>{rects}</mask>;
}

function freq(base: number, scale: number): string {
	return (base / Math.max(0.1, scale)).toFixed(5);
}

function filterProps(id: string) {
	return {
		id,
		x: 0,
		y: 0,
		width: SIZE,
		height: SIZE,
		filterUnits: 'userSpaceOnUse' as const,
		colorInterpolationFilters: 'sRGB' as const,
	};
}

function WoodFilter({ id, seed, scale, vertical }: { id: string; seed: number; scale: number; vertical: boolean }) {
	const along = freq(0.0028, scale);
	const across = freq(0.055, scale);
	return (
		<filter {...filterProps(id)}>
			<feTurbulence
				type="fractalNoise"
				baseFrequency={vertical ? `${across} ${along}` : `${along} ${across}`}
				numOctaves={4}
				seed={seed}
				result="grain"
			/>
			<feColorMatrix in="grain" type="matrix" values={GREY} result="g" />
			{/* Contour banding → growth rings / figure. */}
			<feComponentTransfer in="g" result="rings">
				<feFuncR type="table" tableValues="0.5 0.3 0.62 0.36 0.66 0.34 0.6 0.38 0.64 0.4 0.56" />
				<feFuncG type="table" tableValues="0.5 0.3 0.62 0.36 0.66 0.34 0.6 0.38 0.64 0.4 0.56" />
				<feFuncB type="table" tableValues="0.5 0.3 0.62 0.36 0.66 0.34 0.6 0.38 0.64 0.4 0.56" />
			</feComponentTransfer>
			<feTurbulence
				type="fractalNoise"
				baseFrequency={vertical ? `${freq(0.9, scale)} ${freq(0.02, scale)}` : `${freq(0.02, scale)} ${freq(0.9, scale)}`}
				numOctaves={2}
				seed={seed + 3}
				result="fine"
			/>
			<feColorMatrix in="fine" type="matrix" values={GREY} result="fineG" />
			<feComposite in="rings" in2="fineG" operator="arithmetic" k1={0} k2={0.8} k3={0.32} k4={-0.06} />
		</filter>
	);
}

function MarbleFilter({ id, seed, scale }: { id: string; seed: number; scale: number }) {
	return (
		<filter {...filterProps(id)}>
			<feTurbulence type="turbulence" baseFrequency={`${freq(0.0035, scale)} ${freq(0.006, scale)}`} numOctaves={5} seed={seed} result="t" />
			<feColorMatrix in="t" type="matrix" values={GREY} result="g" />
			{/* Turbulence is |noise|: near-zero creases become veins. Output ≈ white except veins (multiply blend). */}
			<feComponentTransfer in="g" result="veins">
				<feFuncR type="table" tableValues="0.42 0.74 0.9 0.97 1 1 1 1 1 1 1 1" />
				<feFuncG type="table" tableValues="0.42 0.74 0.9 0.97 1 1 1 1 1 1 1 1" />
				<feFuncB type="table" tableValues="0.42 0.74 0.9 0.97 1 1 1 1 1 1 1 1" />
			</feComponentTransfer>
			<feTurbulence type="fractalNoise" baseFrequency={freq(0.012, scale)} numOctaves={3} seed={seed + 9} result="cloud" />
			<feColorMatrix in="cloud" type="matrix" values={GREY} result="cloudG" />
			<feComposite in="veins" in2="cloudG" operator="arithmetic" k1={0} k2={1} k3={0.3} k4={-0.16} />
		</filter>
	);
}

function SlateFilter({ id, seed, scale }: { id: string; seed: number; scale: number }) {
	return (
		<filter {...filterProps(id)}>
			<feTurbulence type="fractalNoise" baseFrequency={`${freq(0.004, scale)} ${freq(0.03, scale)}`} numOctaves={4} seed={seed} result="strata" />
			<feColorMatrix in="strata" type="matrix" values={GREY} result="s" />
			<feTurbulence type="fractalNoise" baseFrequency={freq(0.75, scale)} numOctaves={2} seed={seed + 4} result="grain" />
			<feColorMatrix in="grain" type="matrix" values={GREY} result="gr" />
			<feComposite in="s" in2="gr" operator="arithmetic" k1={0} k2={1.1} k3={0.35} k4={-0.22} />
		</filter>
	);
}

function FeltFilter({ id, seed, scale }: { id: string; seed: number; scale: number }) {
	return (
		<filter {...filterProps(id)}>
			<feTurbulence type="fractalNoise" baseFrequency={freq(1.1, scale)} numOctaves={2} seed={seed} result="fibre" />
			<feColorMatrix in="fibre" type="matrix" values={GREY} result="f" />
			<feTurbulence type="fractalNoise" baseFrequency={freq(0.02, scale)} numOctaves={3} seed={seed + 2} result="mottle" />
			<feColorMatrix in="mottle" type="matrix" values={GREY} result="m" />
			<feComposite in="f" in2="m" operator="arithmetic" k1={0} k2={0.9} k3={0.45} k4={-0.17} />
		</filter>
	);
}

function PaperFilter({ id, seed, scale }: { id: string; seed: number; scale: number }) {
	return (
		<filter {...filterProps(id)}>
			<feTurbulence type="fractalNoise" baseFrequency={freq(0.025, scale)} numOctaves={5} seed={seed} result="fib" />
			<feColorMatrix in="fib" type="matrix" values={GREY} result="f" />
			<feTurbulence type="fractalNoise" baseFrequency={freq(1.4, scale)} numOctaves={1} seed={seed + 1} result="tooth" />
			<feColorMatrix in="tooth" type="matrix" values={GREY} result="t" />
			<feComposite in="f" in2="t" operator="arithmetic" k1={0} k2={0.7} k3={0.5} k4={-0.1} />
		</filter>
	);
}

export const TextureLayer = memo(function TextureLayer({ texture }: Props) {
	const { kind, scale, seed } = texture;
	if (kind === 'none' || texture.intensity <= 0) return null;
	const uid = `bt${++instance}`;
	let body: JSX.Element;
	switch (kind) {
		case 'wood':
			body = (
				<>
					<defs>
						<WoodFilter id={`${uid}-h`} seed={seed} scale={scale} vertical={false} />
						<WoodFilter id={`${uid}-v`} seed={seed + 17} scale={scale} vertical />
						<SquareMask id={`${uid}-ml`} dark={false} />
						<SquareMask id={`${uid}-md`} dark />
					</defs>
					<rect width={SIZE} height={SIZE} filter={`url(#${uid}-h)`} mask={`url(#${uid}-ml)`} />
					<rect width={SIZE} height={SIZE} filter={`url(#${uid}-v)`} mask={`url(#${uid}-md)`} />
				</>
			);
			break;
		case 'marble':
			body = (
				<>
					<defs>
						<MarbleFilter id={uid} seed={seed} scale={scale} />
					</defs>
					<rect width={SIZE} height={SIZE} filter={`url(#${uid})`} />
				</>
			);
			break;
		case 'slate':
		case 'felt':
		case 'paper': {
			const F = kind === 'slate' ? SlateFilter : kind === 'felt' ? FeltFilter : PaperFilter;
			body = (
				<>
					<defs>
						<F id={uid} seed={seed} scale={scale} />
					</defs>
					<rect width={SIZE} height={SIZE} filter={`url(#${uid})`} />
				</>
			);
			break;
		}
		case 'gradient':
		default:
			body = (
				<>
					<defs>
						<linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
							<stop offset="0" stop-color="#fff" stop-opacity="0.9" />
							<stop offset="0.5" stop-color="#808080" stop-opacity="0" />
							<stop offset="1" stop-color="#000" stop-opacity="0.9" />
						</linearGradient>
						<radialGradient id={`${uid}-r`} cx="0.5" cy="0.5" r="0.75">
							<stop offset="0.55" stop-color="#000" stop-opacity="0" />
							<stop offset="1" stop-color="#000" stop-opacity="0.6" />
						</radialGradient>
					</defs>
					<rect width={SIZE} height={SIZE} fill={`url(#${uid})`} />
					<rect width={SIZE} height={SIZE} fill={`url(#${uid}-r)`} />
				</>
			);
	}
	return (
		<svg
			class={`board__texture board__texture--${kind}`}
			viewBox={`0 0 ${SIZE} ${SIZE}`}
			preserveAspectRatio="none"
			aria-hidden="true"
			style={{ opacity: Math.min(1, Math.max(0, texture.intensity)) }}
		>
			{body}
		</svg>
	);
});

/**
 * Lux — original Staunton-profile set with a layered neutral shading group.
 * Each part = body fill → pc-shade overlay (cylindrical / spherical light) → line stroke,
 * drawn bottom-up so upper parts overlap lower ones like a real turned piece.
 */
import { circle, lathe, rect, type Pt } from './geom.js';
import type { OriginalSet } from './index.js';

type Shade = 'cyl' | 'sph' | 'flat';
interface Part {
	d: string;
	shade: Shade;
}

const LINE_W = 1.5;

/** Shared gradients (objectBoundingBox → one definition fits every part). */
export const LUX_DEFS = `
<linearGradient id="lux-cyl" x1="0" y1="0" x2="1" y2="0">
	<stop offset="0" stop-color="#000" stop-opacity=".32"/>
	<stop offset=".1" stop-color="#fff" stop-opacity=".08"/>
	<stop offset=".27" stop-color="#fff" stop-opacity=".62"/>
	<stop offset=".4" stop-color="#fff" stop-opacity=".14"/>
	<stop offset=".6" stop-color="#000" stop-opacity="0"/>
	<stop offset=".86" stop-color="#000" stop-opacity=".26"/>
	<stop offset="1" stop-color="#000" stop-opacity=".48"/>
</linearGradient>
<radialGradient id="lux-sph" cx=".5" cy=".5" r=".55" fx=".36" fy=".3">
	<stop offset="0" stop-color="#fff" stop-opacity=".85"/>
	<stop offset=".22" stop-color="#fff" stop-opacity=".3"/>
	<stop offset=".55" stop-color="#000" stop-opacity="0"/>
	<stop offset="1" stop-color="#000" stop-opacity=".5"/>
</radialGradient>
<linearGradient id="lux-flat" x1="0" y1="0" x2=".9" y2="1">
	<stop offset="0" stop-color="#fff" stop-opacity=".5"/>
	<stop offset=".35" stop-color="#fff" stop-opacity=".08"/>
	<stop offset=".7" stop-color="#000" stop-opacity=".08"/>
	<stop offset="1" stop-color="#000" stop-opacity=".42"/>
</linearGradient>
<linearGradient id="lux-vert" x1="0" y1="0" x2="0" y2="1">
	<stop offset="0" stop-color="#fff" stop-opacity=".18"/>
	<stop offset=".45" stop-color="#fff" stop-opacity="0"/>
	<stop offset=".8" stop-color="#000" stop-opacity="0"/>
	<stop offset="1" stop-color="#000" stop-opacity=".22"/>
</linearGradient>`;

const L = (profile: [number, number][], tension = 1): Part => ({ d: lathe(profile, 50, tension), shade: 'cyl' });

/** Staunton foot: wide plinth + torus ring. */
function base(R: number): Part[] {
	return [
		L([
			[91.5, R],
			[89.6, R + 0.7],
			[87.2, R + 0.3],
			[85.6, R - 1.6],
			[85, R - 4],
		]),
		L([
			[86, R - 4.2],
			[84.4, R - 3],
			[81.8, R - 3.3],
			[80.2, R - 5.8],
		]),
	];
}

function render(parts: Part[], details = ''): string {
	const out: string[] = [];
	for (const p of parts) {
		const fill = p.shade === 'sph' ? 'lux-sph' : p.shade === 'flat' ? 'lux-flat' : 'lux-cyl';
		out.push(
			`<path d="${p.d}" style="fill:var(--pc-body);stroke:none"/>`,
			`<path class="pc-shade" d="${p.d}" style="fill:url(#${fill});opacity:var(--pc-shade,1)"/>`,
			`<path d="${p.d}" style="fill:none;stroke:var(--pc-line);stroke-width:${LINE_W};stroke-linejoin:round"/>`,
		);
	}
	// Whole-piece vertical light falloff for depth.
	const all = parts.map((p) => p.d).join(' ');
	out.push(`<path class="pc-shade" d="${all}" style="fill:url(#lux-vert);opacity:var(--pc-shade,1)"/>`);
	return out.join('') + details;
}

const accentStroke = (d: string, w = 1.3) =>
	`<path d="${d}" style="fill:none;stroke:var(--pc-accent);stroke-width:${w};stroke-linecap:round;stroke-linejoin:round"/>`;
const lineFill = (d: string) => `<path d="${d}" style="fill:var(--pc-line);stroke:none"/>`;

// ── pieces ────────────────────────────────────────────────────────────────

function pawn(): string {
	return render([
		...base(23),
		L([
			[81.5, 15],
			[74, 11],
			[66, 8.2],
			[58, 7],
			[53, 7.2],
		]),
		L([
			[55.5, 12.6],
			[54, 13.6],
			[51.6, 13.4],
			[50.3, 10],
		]),
		{ d: circle(50, 40, 11.6), shade: 'sph' },
	]);
}

function rook(): string {
	const crown: Pt[] = [
		[29.5, 44],
		[29.5, 25],
		[37.5, 25],
		[37.5, 30],
		[45.5, 30],
		[45.5, 25],
		[54.5, 25],
		[54.5, 30],
		[62.5, 30],
		[62.5, 25],
		[70.5, 25],
		[70.5, 44],
	];
	const crownD = `M${crown.map((p) => p.join(' ')).join(' L')} Z`;
	return render([
		...base(26),
		L(
			[
				[81.5, 19],
				[74, 16.5],
				[62, 15],
				[50, 15.2],
				[46, 16],
			],
			0.9,
		),
		L([
			[48, 18.8],
			[46.5, 20.4],
			[44.2, 20.6],
			[43, 18],
		]),
		{ d: crownD, shade: 'cyl' },
	]);
}

function bishop(): string {
	const mitre = lathe(
		[
			[47.5, 8.2],
			[44, 11.2],
			[38, 13],
			[32, 12],
			[26.5, 8.8],
			[23, 4.4],
			[21.4, 1.2],
		],
		50,
	);
	return render(
		[
			...base(25),
			L([
				[81.5, 17.5],
				[74, 11.5],
				[64, 8],
				[55, 6.6],
				[50, 6.8],
			]),
			L([
				[53, 13.4],
				[51.4, 14.6],
				[49, 14.2],
				[47.8, 10.5],
			]),
			{ d: mitre, shade: 'cyl' },
			{ d: circle(50, 18.2, 4.1), shade: 'sph' },
		],
		// Mitre slit.
		`<path d="M56.4 27.4 L47.6 37.2" style="fill:none;stroke:var(--pc-line);stroke-width:2.6;stroke-linecap:round"/>`,
	);
}

function queen(): string {
	// Coronet: flared cup with five points tipped by balls.
	const cup = lathe(
		[
			[42.5, 10.2],
			[38, 12.2],
			[33, 15.6],
			[29, 18.2],
		],
		50,
	);
	const pts: Pt[] = [
		[31.2, 29.6],
		[30.4, 21.5],
		[39.8, 27.4],
		[42.3, 18.5],
		[50, 26.2],
		[57.7, 18.5],
		[60.2, 27.4],
		[69.6, 21.5],
		[68.8, 29.6],
	];
	const coronet = `M${pts.map((p) => p.join(' ')).join(' L')} Z`;
	const balls = [
		[30.4, 21.2, 2.7],
		[42.3, 17.6, 2.7],
		[57.7, 17.6, 2.7],
		[69.6, 21.2, 2.7],
	] as const;
	return render([
		...base(28),
		L([
			[81.5, 20.5],
			[72, 13.5],
			[60, 9.4],
			[50, 8.2],
			[44, 8.8],
		]),
		L([
			[47, 14],
			[45.4, 15.4],
			[43, 15],
			[41.8, 11.5],
		]),
		{ d: coronet, shade: 'flat' },
		{ d: cup, shade: 'cyl' },
		...balls.map(([x, y, r]) => ({ d: circle(x, y, r), shade: 'sph' as Shade })),
		L([
			[30, 9.8],
			[27.5, 8.6],
			[24.6, 5.4],
			[23.4, 1.6],
		]),
		{ d: circle(50, 18.6, 4.2), shade: 'sph' },
	]);
}

function king(): string {
	return render([
		...base(28.5),
		L([
			[81.5, 21],
			[72, 14],
			[60, 9.8],
			[50, 8.6],
			[44, 9.2],
		]),
		L([
			[46.8, 14.6],
			[45.2, 16],
			[42.8, 15.6],
			[41.6, 12],
		]),
		L([
			[42.4, 10.6],
			[38, 12.6],
			[33, 15.4],
			[29.2, 16.8],
			[27.6, 15.6],
		]),
		L([
			[28, 13.8],
			[25.6, 11.4],
			[23.2, 6.4],
			[22, 2.6],
		]),
		{ d: rect(47.4, 6, 5.2, 16.4, 0.8), shade: 'cyl' },
		{ d: rect(42.4, 10.4, 15.2, 5, 0.8), shade: 'flat' },
	]);
}

function knight(): string {
	// Horse head facing left, sitting on a Staunton foot.
	const head = `M70.4 81.5
		C72.6 70 73.6 56 69.6 45.2
		C66.8 37.4 62 31.4 58.4 25.4
		C58 22 58.6 18.6 59.4 14.6
		C55.4 15.8 52.6 18.2 50.6 21
		C49.4 18.4 47.6 16.6 45.4 15.4
		C45 18.6 45.2 21 46.2 23
		C39.6 26.4 33.6 32.4 28.8 39.6
		C25.4 44.6 21.6 49.4 19.4 53.6
		C17.8 56.8 19.4 61 23.4 61.6
		C27 62.2 30.4 60.6 33.6 59.6
		C37 58.6 40.4 58.8 43.4 57.8
		C46.6 56.8 49.4 54.6 51.4 52
		C51.4 59.8 46.8 66.2 40.8 71.2
		C37.6 73.8 34 76.8 31.4 81.5 Z`;
	const details =
		// Eye
		lineFill(
			`M41.4 32.2 C43.2 30.8 46 30.8 47.4 32.4 C46 34.4 43.2 34.8 41.4 32.2 Z`,
		) +
		// Nostril
		lineFill(`M23.2 55.2 C24.6 54.2 26.4 54.6 26.8 56 C25.6 57.2 23.8 57 23.2 55.2 Z`) +
		// Mouth line + jaw
		accentStroke(`M22.4 59.6 C25.6 59 28.4 58.6 31.4 58.8`, 1.2) +
		accentStroke(`M51.2 52.2 C47.4 50.6 44.6 47.2 43.6 43.4`, 1.2) +
		// Mane braid line
		accentStroke(`M60.8 30 C64.6 36 67.6 42.4 68.8 49.6 C69.8 56 69.6 64 68.6 72`, 1.1);
	return render(
		[
			...base(26.5),
			{ d: head, shade: 'flat' },
		],
		details,
	);
}

export const LUX: OriginalSet = {
	id: 'lux',
	name: 'Lux',
	author: 'chess app (original)',
	license: 'MIT',
	viewBox: '4 3 92 92',
	defs: LUX_DEFS,
	symbols: { K: king(), Q: queen(), R: rook(), B: bishop(), N: knight(), P: pawn() },
	defaultColors: {
		white: { body: '#f3ead8', line: '#3b2f24', accent: '#5a4a3a' },
		black: { body: '#3a3230', line: '#100c0a', accent: '#cdbda4' },
	},
};

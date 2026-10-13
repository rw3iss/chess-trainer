/**
 * Sleek — original minimal geometric set. One silhouette path per piece, outlined
 * by drawing it twice (wide line-coloured stroke underneath, body fill on top) so
 * overlapping primitives read as a single clean shape; a few accent details.
 */
import { circle, rect } from './geom.js';
import type { OriginalSet } from './index.js';

const W = 2.2;

function render(silhouette: string[], details = ''): string {
	const d = silhouette.join(' ');
	return (
		`<path d="${d}" style="fill:var(--pc-line);stroke:var(--pc-line);stroke-width:${W * 2};stroke-linejoin:round"/>` +
		`<path d="${d}" style="fill:var(--pc-body);stroke:none"/>` +
		`<path class="pc-shade" d="${d}" style="fill:url(#sleek-sheen);opacity:var(--pc-shade,1)"/>` +
		details
	);
}

const accent = (d: string, w = 1.6) =>
	`<path d="${d}" style="fill:none;stroke:var(--pc-accent);stroke-width:${w};stroke-linecap:round;stroke-linejoin:round"/>`;
const accentFill = (d: string) => `<path d="${d}" style="fill:var(--pc-accent);stroke:none"/>`;

export const SLEEK_DEFS = `
<linearGradient id="sleek-sheen" x1="0" y1="0" x2="1" y2="0">
	<stop offset="0" stop-color="#fff" stop-opacity=".0"/>
	<stop offset=".3" stop-color="#fff" stop-opacity=".22"/>
	<stop offset=".55" stop-color="#fff" stop-opacity="0"/>
	<stop offset="1" stop-color="#000" stop-opacity=".16"/>
</linearGradient>`;

const foot = (w: number) => rect(50 - w / 2, 82, w, 7, 3.5);
const flare = (top: number, topW: number, botW: number) =>
	`M${50 - topW / 2} ${top} C${50 - topW / 2} ${top + 16} ${50 - botW / 2 + 6} ${74} ${50 - botW / 2} 82 L${50 + botW / 2} 82 C${50 + botW / 2 - 6} 74 ${50 + topW / 2} ${top + 16} ${50 + topW / 2} ${top} Z`;
const collar = (y: number, w: number) => rect(50 - w / 2, y, w, 4.6, 2.3);

const pawn = () =>
	render([foot(44), flare(50, 14, 34), collar(47.5, 24), circle(50, 37, 11)], accent(`M37 82 H63`, 1.4));

const rook = () =>
	render(
		[
			foot(50),
			`M37 82 L39 45 L61 45 L63 82 Z`,
			collar(42, 30),
			`M32 43 L32 23 Q32 22 33 22 L39 22 L39 29 L46.5 29 L46.5 22 L53.5 22 L53.5 29 L61 29 L61 22 L67 22 Q68 22 68 23 L68 43 Z`,
		],
		accent(`M39 82 H61`, 1.4) + accent(`M35 36 H65`, 1.4),
	);

const bishop = () =>
	render(
		[
			foot(48),
			flare(48, 12, 36),
			collar(45, 26),
			`M50 17 C58 23 62.5 31 60.8 38.5 C59.6 43.5 55.4 46 50 46 C44.6 46 40.4 43.5 39.2 38.5 C37.5 31 42 23 50 17 Z`,
			circle(50, 13.5, 3.6),
		],
		accent(`M54.5 26 L47 35.5`, 2.2) + accent(`M37 82 H63`, 1.4),
	);

const queen = () =>
	render(
		[
			foot(54),
			flare(46, 14, 40),
			collar(43, 30),
			`M34.5 44 L29 21 L40.5 32.5 L50 16 L59.5 32.5 L71 21 L65.5 44 Z`,
			circle(29, 19, 3.3),
			circle(50, 13.5, 3.5),
			circle(71, 19, 3.3),
		],
		accent(`M35 82 H65`, 1.4) + accent(`M35.5 38.5 H64.5`, 1.4),
	);

const king = () =>
	render(
		[
			foot(54),
			flare(47, 14, 40),
			collar(44, 30),
			`M38.5 45 C34 39.5 32 34.5 33.4 30.2 C40 26.8 60 26.8 66.6 30.2 C68 34.5 66 39.5 61.5 45 Z`,
			rect(47.4, 7, 5.2, 21, 1.2),
			rect(41.5, 11.6, 17, 5.2, 1.2),
		],
		accent(`M35 82 H65`, 1.4) + accent(`M36 36.5 C44 34.8 56 34.8 64 36.5`, 1.4),
	);

const knight = () =>
	render(
		[
			foot(50),
			`M67 82 L33.5 82 C35 72.5 41 65 46.5 58.5 L37.5 60.2 C31 61.4 25.6 58.6 24.6 53.4 C24.2 51.4 24.8 49.6 26 47.8 L36.5 32.8 C40.2 27 45 22.2 51 19.4 L53.6 11.5 L58.4 18.6 C66.4 23.8 70.6 34 70.6 46.6 C70.6 60 67 70 67 82 Z`,
		],
		accentFill(circle(44.4, 32, 2.4)) + accent(`M58.8 21.5 C65 28 67.4 37 67.4 47`, 1.4) + accent(`M37 82 H63`, 1.4),
	);

export const SLEEK: OriginalSet = {
	id: 'sleek',
	name: 'Sleek',
	author: 'chess app (original)',
	license: 'MIT',
	viewBox: '4 3 92 92',
	defs: SLEEK_DEFS,
	symbols: { K: king(), Q: queen(), R: rook(), B: bishop(), N: knight(), P: pawn() },
	defaultColors: {
		white: { body: '#fbfaf7', line: '#1d1d22', accent: '#1d1d22' },
		black: { body: '#2b2b31', line: '#0c0c0f', accent: '#d8d8de' },
	},
};

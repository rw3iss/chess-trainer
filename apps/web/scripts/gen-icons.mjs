#!/usr/bin/env node
// Generates the app icons from one knight drawing (single source of truth):
//
//   public/icon.svg                    favicon + manifest "any" (rounded ink tile)
//   public/icons/maskable.svg          manifest "maskable" source (full-bleed, knight in the 80% safe zone)
//   public/icons/icon-{192,512}.png    manifest "any"
//   public/icons/maskable-{192,512}.png manifest "maskable"
//   public/icons/apple-touch-icon.png  180×180, opaque (iOS rounds it)
//
// PNGs are rasterised with Playwright's Chromium (devDependency; no extra installs).
// Usage: node scripts/gen-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(webRoot, 'public');
const iconsDir = path.join(publicDir, 'icons');

// DESIGN.md dark tokens: --color-bg (ink) and --color-accent (brass).
const INK = '#0e0f12';
const INK_GLOW = '#1b1c22';
const BRASS = '#c9a45c';
const BRASS_LIGHT = '#e3c787';
const BRASS_DARK = '#9c7a3a';

// Knight drawn on a 100×100 grid, facing left, centred on (50, 50).
const KNIGHT = `
	<path fill="url(#brass)" fill-rule="evenodd" d="
		M31 74
		C31 66.4 33.6 60.8 39.4 55.6
		C35 58.2 30.4 60.6 25.6 61.2
		C21.8 61.7 18.4 60.2 16.8 57.4
		C15.5 55.1 15.5 52.4 16.7 50.2
		L27.2 31.6
		L33.2 13.2
		C33.6 11.9 35.2 11.6 36 12.6
		L42.6 20.4
		C58.8 21.6 72.6 33 75.5 50.4
		C76.9 58.6 75.9 66.6 72.9 74
		Z
		M31.8 35.4
		a2.5 2.5 0 1 0 0.01 0Z
		M20.2 54.2
		a1.3 1.3 0 1 0 0.01 0Z" />
	<path fill="none" stroke="${BRASS_LIGHT}" stroke-opacity=".5" stroke-width="1.8" stroke-linecap="round" d="M46 24.4 C58.8 27.2 67.6 37.2 69.2 51 C69.9 57.4 69.2 63.4 67.4 69" />
	<rect x="26" y="76.4" width="51" height="6" rx="2.2" fill="url(#brass)" />
	<rect x="20.5" y="84.4" width="62" height="7.4" rx="2.6" fill="url(#brass)" />
`;

const DEFS = `
	<defs>
		<linearGradient id="brass" x1="0" y1="0" x2="0.35" y2="1">
			<stop offset="0" stop-color="${BRASS_LIGHT}" />
			<stop offset="0.55" stop-color="${BRASS}" />
			<stop offset="1" stop-color="${BRASS_DARK}" />
		</linearGradient>
		<radialGradient id="glow" cx="0.5" cy="0.3" r="0.75">
			<stop offset="0" stop-color="${INK_GLOW}" />
			<stop offset="1" stop-color="${INK}" />
		</radialGradient>
	</defs>
`;

/** Knight centred in a 512 box at `scale` (fraction of the box the 100-grid occupies). */
function knightAt(scale) {
	const s = (512 * scale) / 100;
	const offset = (512 - 100 * s) / 2;
	return `<g transform="translate(${offset.toFixed(2)} ${(offset - 2 * s).toFixed(2)}) scale(${s.toFixed(4)})">${KNIGHT}</g>`;
}

/** Rounded ink tile with a hairline brass ring — favicon / "any" purpose. */
const anySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
	<rect width="512" height="512" rx="112" fill="url(#glow)" />
	<rect x="18" y="18" width="476" height="476" rx="96" fill="none" stroke="${BRASS}" stroke-opacity=".28" stroke-width="5" />
	${knightAt(0.8)}
</svg>
`;

/** Full-bleed square; knight fits inside the 80% safe-zone circle. */
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
	<rect width="512" height="512" fill="url(#glow)" />
	${knightAt(0.66)}
</svg>
`;

/** Full-bleed square for iOS (it applies its own corner mask). */
const appleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
	<rect width="512" height="512" fill="url(#glow)" />
	${knightAt(0.74)}
</svg>
`;

const RASTERS = [
	{ file: 'icon-192.png', svg: anySvg, size: 192, opaque: false },
	{ file: 'icon-512.png', svg: anySvg, size: 512, opaque: false },
	{ file: 'maskable-192.png', svg: maskableSvg, size: 192, opaque: true },
	{ file: 'maskable-512.png', svg: maskableSvg, size: 512, opaque: true },
	{ file: 'apple-touch-icon.png', svg: appleSvg, size: 180, opaque: true },
];

async function main() {
	await mkdir(iconsDir, { recursive: true });
	await writeFile(path.join(publicDir, 'icon.svg'), anySvg);
	await writeFile(path.join(iconsDir, 'maskable.svg'), maskableSvg);

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ deviceScaleFactor: 1 });
		for (const { file, svg, size, opaque } of RASTERS) {
			await page.setViewportSize({ width: size, height: size });
			const bg = opaque ? INK : 'transparent';
			const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
			await page.setContent(
				`<html><body style="margin:0;background:${bg}"><img src="${uri}" width="${size}" height="${size}" style="display:block" /></body></html>`,
			);
			await page.waitForFunction(() => document.images[0]?.complete);
			await page.screenshot({ path: path.join(iconsDir, file), omitBackground: !opaque, clip: { x: 0, y: 0, width: size, height: size } });
			console.log(`wrote public/icons/${file}`);
		}
	} finally {
		await browser.close();
	}
}

await main();

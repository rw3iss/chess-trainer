/**
 * Build recolorable piece sprites.
 *   pnpm assets:pieces            → download (cached), normalize, write sprites/manifest/licenses/preview + core TS
 *   pnpm assets:pieces --render   → also render preview.html to PNG with Playwright
 *
 * Outputs:
 *   apps/web/public/pieces/<id>/sprite.svg
 *   apps/web/public/pieces/manifest.json
 *   apps/web/public/pieces/LICENSES.md
 *   apps/web/public/pieces/preview.html
 *   packages/core/src/theme/pieceSets.generated.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PieceSetAsset, PieceSideColors } from '../../../packages/core/src/theme/types.js';
import { normalizePiece } from './normalize.js';
import { SOURCE_BASE, SOURCE_SETS, sourceUrl, type SourceSet } from './sets.js';
import { ORIGINAL_SETS } from './originals/index.js';
import { writePreview } from './preview.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const CACHE = path.resolve(HERE, '../.cache');
const OUT = path.join(ROOT, 'apps/web/public/pieces');
const CORE_OUT = path.join(ROOT, 'packages/core/src/theme/pieceSets.generated.ts');

const PIECES = ['K', 'Q', 'R', 'B', 'N', 'P'] as const;
const SIDES = [
	['w', 'white'],
	['b', 'black'],
] as const;

async function fetchSource(set: string, file: string): Promise<string | null> {
	const local = path.join(CACHE, set, file);
	if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
	const res = await fetch(`${SOURCE_BASE}/${set}/${file}`);
	if (!res.ok) return null;
	const text = await res.text();
	fs.mkdirSync(path.dirname(local), { recursive: true });
	fs.writeFileSync(local, text);
	return text;
}

const sideColors = (a: { body: string; line: string; accent?: string }): PieceSideColors => ({
	body: a.body,
	line: a.line,
	accent: a.accent ?? a.line,
});

interface BuiltSet {
	asset: PieceSetAsset;
	sprite: string;
	licenseNote: string;
}

function spriteDoc(symbols: string[]): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n${symbols.join('\n')}\n</svg>\n`;
}

async function buildSource(set: SourceSet): Promise<BuiltSet | null> {
	const files: Record<string, string> = {};
	for (const [s] of SIDES) {
		for (const p of PIECES) {
			const txt = await fetchSource(set.id, `${s}${p}.svg`);
			if (!txt) {
				console.warn(`! ${set.id}: missing ${s}${p}.svg — skipping set`);
				return null;
			}
			files[`${s}${p}`] = txt;
		}
	}
	const perColor: Record<string, { viewBox: string; body: string }> = {};
	for (const [s, color] of SIDES) {
		for (const p of PIECES) {
			perColor[`${s}${p}`] = normalizePiece(files[`${s}${p}`]!, {
				anchors: set.anchors[color],
				tones: set.tones,
				idPrefix: `${set.id}-${s}${p}-`,
			});
		}
	}
	// Shared layout when both sides normalize to identical markup.
	const shared = PIECES.every((p) => {
		const w = perColor[`w${p}`]!;
		const b = perColor[`b${p}`]!;
		const norm = (x: string, s: string) => x.split(`${set.id}-${s}${p}-`).join('#ID#');
		return w.viewBox === b.viewBox && norm(w.body, 'w') === norm(b.body, 'b');
	});
	const symbols: string[] = [];
	if (shared) {
		for (const p of PIECES) {
			const w = perColor[`w${p}`]!;
			const body = w.body.split(`${set.id}-w${p}-`).join(`${set.id}-${p}-`);
			symbols.push(`<symbol id="${p}" viewBox="${w.viewBox}">${body}</symbol>`);
		}
	} else {
		for (const key of Object.keys(perColor)) {
			const x = perColor[key]!;
			symbols.push(`<symbol id="${key}" viewBox="${x.viewBox}">${x.body}</symbol>`);
		}
	}
	const viewBox = perColor.wK!.viewBox;
	const asset: PieceSetAsset = {
		id: set.id,
		name: set.name,
		author: set.author,
		license: set.license,
		sourceUrl: sourceUrl(set.id),
		sprite: `pieces/${set.id}/sprite.svg`,
		layout: shared ? 'shared' : 'per-color',
		viewBox,
		defaultColors: { white: sideColors(set.anchors.white), black: sideColors(set.anchors.black) },
		...(set.personalUseOnly ? { personalUseOnly: true } : {}),
	};
	const author = set.authorUrl ? `[${set.author}](${set.authorUrl})` : set.author;
	const licenseNote = `| ${set.name} (\`${set.id}\`) | ${author} | [${set.license}](${set.licenseUrl})${set.personalUseOnly ? ' — **personal / non-commercial use only**' : ''} | ${sourceUrl(set.id)} |`;
	return { asset, sprite: spriteDoc(symbols), licenseNote };
}

function buildOriginals(): BuiltSet[] {
	return ORIGINAL_SETS.map((o) => {
		const symbols = PIECES.map((p) => `<symbol id="${p}" viewBox="${o.viewBox}">${o.symbols[p]}</symbol>`);
		const asset: PieceSetAsset = {
			id: o.id,
			name: o.name,
			author: o.author,
			license: o.license,
			sprite: `pieces/${o.id}/sprite.svg`,
			layout: 'shared',
			viewBox: o.viewBox,
			defaultColors: o.defaultColors,
		};
		const defs = o.defs ? [`<defs>${o.defs}</defs>`] : [];
		return {
			asset,
			sprite: spriteDoc([...defs, ...symbols]),
			licenseNote: `| ${o.name} (\`${o.id}\`) | ${o.author} | ${o.license} | original, authored in tools/piece-assets/src/originals |`,
		};
	});
}

function writeCore(assets: PieceSetAsset[]): void {
	const body = JSON.stringify(assets, null, '\t').replace(/"([a-zA-Z]+)":/g, '$1:');
	const ts = `// GENERATED by tools/piece-assets (pnpm assets:pieces). Do not edit by hand.\nimport type { PieceSetAsset } from './types.js';\n\nexport const BUILTIN_PIECE_SETS: PieceSetAsset[] = ${body};\n`;
	fs.writeFileSync(CORE_OUT, ts);
}

async function main(): Promise<void> {
	const render = process.argv.includes('--render');
	const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
	const built: BuiltSet[] = [...buildOriginals()];
	for (const set of SOURCE_SETS) {
		if (only && !only.includes(set.id)) continue;
		const b = await buildSource(set);
		if (b) built.push(b);
	}
	fs.mkdirSync(OUT, { recursive: true });
	for (const b of built) {
		const dir = path.join(OUT, b.asset.id);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, 'sprite.svg'), b.sprite);
		console.log(`✓ ${b.asset.id.padEnd(12)} ${b.asset.layout.padEnd(9)} ${(b.sprite.length / 1024).toFixed(1)} KB`);
	}
	const assets = built.map((b) => b.asset);
	if (!only) fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(assets, null, '\t') + '\n');
	if (!only) fs.writeFileSync(
		path.join(OUT, 'LICENSES.md'),
		[
			'# Piece set licenses',
			'',
			'Imported sets come from the Lichess `lila` repository and were normalized into recolorable sprites by `tools/piece-assets`. Sets marked personal-use-only are licensed CC BY-NC-SA 4.0 and must not ship in a commercial build.',
			'',
			'| Set | Author | License | Source |',
			'|---|---|---|---|',
			...built.map((b) => b.licenseNote),
			'',
		].join('\n'),
	);
	if (!only) writeCore(assets);
	const previewPath = writePreview(only ? path.resolve(HERE, '../out') : OUT, built.map((b) => ({ asset: b.asset, sprite: b.sprite })), only ? 110 : 56);
	console.log(`preview: ${previewPath}`);
	if (render) {
		const { renderPreview } = await import('./render.js');
		const png = await renderPreview(previewPath, path.resolve(HERE, '../out/preview.png'), only ? 2100 : 1100);
		console.log(`rendered: ${png}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

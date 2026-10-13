import fs from 'node:fs';
import path from 'node:path';
import type { PieceSetAsset, PieceSideColors } from '../../../packages/core/src/theme/types.js';

type Scheme = { name: string; white: PieceSideColors; black: PieceSideColors } | { name: string; defaults: true };

export const PREVIEW_SCHEMES: Scheme[] = [
	{ name: 'Default', defaults: true },
	{
		name: 'Ivory / Walnut',
		white: { body: '#f2e3c2', line: '#3b2614', accent: '#3b2614' },
		black: { body: '#5a3a24', line: '#170d06', accent: '#e9c999' },
	},
	{
		name: 'Sky / Crimson',
		white: { body: '#7cc6f2', line: '#0b3954', accent: '#0b3954' },
		black: { body: '#d7263d', line: '#3d0710', accent: '#ffd6dc' },
	},
];

const PIECES = ['K', 'Q', 'R', 'B', 'N', 'P'];

/** Rename symbol ids `K` → `<set>--K` so many sprites can coexist inline (same as the web runtime). */
export function inlineSprite(setId: string, sprite: string): string {
	return sprite
		.replace(/^<svg[^>]*>/, '')
		.replace(/<\/svg>\s*$/, '')
		.replace(/<symbol id="([^"]+)"/g, (_m, id) => `<symbol id="${setId}--${id}"`);
}

function vars(prefix: string, c: PieceSideColors): string {
	return `--${prefix}-body:${c.body};--${prefix}-line:${c.line};--${prefix}-accent:${c.accent}`;
}

export function writePreview(outDir: string, sets: { asset: PieceSetAsset; sprite: string }[], size = 56): string {
	const sprites = sets.map((s) => inlineSprite(s.asset.id, s.sprite)).join('\n');
	const rows = sets
		.map(({ asset }) => {
			const panels = PREVIEW_SCHEMES.map((sc) => {
				const w = 'defaults' in sc ? asset.defaultColors.white : sc.white;
				const b = 'defaults' in sc ? asset.defaultColors.black : sc.black;
				const cells = (['w', 'b'] as const)
					.flatMap((side) =>
						PIECES.map((p, i) => {
							const id = asset.layout === 'shared' ? p : `${side}${p}`;
							const sq = (i + (side === 'b' ? 1 : 0)) % 2 ? 'd' : 'l';
							return `<div class="sq ${sq} ${side}"><svg viewBox="${asset.viewBox}"><use href="#${asset.id}--${id}"/></svg></div>`;
						}),
					)
					.join('');
				return `<div class="panel" style="${vars('w', w)};${vars('b', b)}"><div class="grid">${cells}</div></div>`;
			}).join('');
			return `<section><h2>${asset.name} <small>${asset.id} · ${asset.layout}${asset.personalUseOnly ? ' · personal use' : ''}</small></h2><div class="panels">${panels}</div></section>`;
		})
		.join('\n');
	const html = `<!doctype html><html><head><meta charset="utf-8"><title>Piece sets</title><style>
body{margin:0;padding:16px;background:#1d1f24;color:#ddd;font:13px system-ui,sans-serif}
h2{font-size:14px;margin:10px 0 4px}small{color:#888;font-weight:400}
.panels{display:flex;gap:12px}.grid{display:grid;grid-template-columns:repeat(6,${size}px)}
.sq{width:${size}px;height:${size}px;display:flex}.sq svg{width:100%;height:100%;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))}
.l{background:#e9d8b8}.d{background:#a87d58}
.w{--pc-body:var(--w-body);--pc-line:var(--w-line);--pc-accent:var(--w-accent)}
.b{--pc-body:var(--b-body);--pc-line:var(--b-line);--pc-accent:var(--b-accent)}
.head{display:flex;gap:12px;margin-left:0}.head div{width:${size * 6}px;color:#aaa}
</style></head><body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">${sprites}</svg>
<div class="head">${PREVIEW_SCHEMES.map((s) => `<div>${s.name}</div>`).join('')}</div>
${rows}
</body></html>`;
	const file = path.join(outDir, 'preview.html');
	fs.writeFileSync(file, html);
	return file;
}

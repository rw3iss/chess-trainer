#!/usr/bin/env node
// Copies the Stockfish WASM builds from node_modules/stockfish into public/engines
// and writes public/engines/manifest.json (sizes + sha256 + precache/on-demand flags).
//
//   public/engines/stockfish/       lite single-threaded build — precached by the SW
//   public/engines/stockfish-full/  full NNUE single-threaded build — on demand only
//                                   (downloaded into Cache Storage from Settings; the SW
//                                   precache glob must exclude this folder)
//
// Usage: node scripts/copy-engines.mjs [--skip-full]
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(webRoot, 'public', 'engines');
const require = createRequire(path.join(webRoot, 'package.json'));
const pkgDir = path.dirname(require.resolve('stockfish/package.json'));
const pkg = JSON.parse(await readFile(path.join(pkgDir, 'package.json'), 'utf8'));
const v = pkg.buildVersion;
const skipFull = process.argv.includes('--skip-full');

const ENGINES = [
	{
		id: 'sf-lite',
		dir: 'stockfish',
		precache: true,
		script: `stockfish-${v}-lite-single.js`,
		wasm: `stockfish-${v}-lite-single.wasm`,
	},
	{
		id: 'sf-full',
		dir: 'stockfish-full',
		precache: false,
		script: `stockfish-${v}-single.js`,
		wasm: `stockfish-${v}-single.wasm`,
	},
];

async function sha256(file) {
	return createHash('sha256').update(await readFile(file)).digest('hex');
}

/** Copy only when size or mtime differ (the full wasm is ~99 MB). */
async function copyIfChanged(src, dst) {
	const s = await stat(src);
	const d = await stat(dst).catch(() => null);
	if (d && d.size === s.size && d.mtimeMs >= s.mtimeMs) return false;
	await copyFile(src, dst);
	return true;
}

const manifest = {
	generatedBy: 'apps/web/scripts/copy-engines.mjs',
	stockfish: { package: 'stockfish', version: pkg.version, license: 'GPL-3.0', source: 'https://github.com/nmrugg/stockfish.js' },
	engines: {},
};

for (const e of ENGINES) {
	if (skipFull && !e.precache) continue;
	const dir = path.join(outRoot, e.dir);
	await mkdir(dir, { recursive: true });
	const files = [];
	for (const name of [e.script, e.wasm]) {
		const src = path.join(pkgDir, 'bin', name);
		const dst = path.join(dir, name);
		const copied = await copyIfChanged(src, dst);
		const { size } = await stat(dst);
		files.push({ path: `${e.dir}/${name}`, bytes: size, sha256: await sha256(dst) });
		console.log(`${copied ? 'copied ' : 'up-to-date'} ${e.dir}/${name} (${(size / 1048576).toFixed(2)} MB)`);
	}
	await copyFile(path.join(pkgDir, 'Copying.txt'), path.join(dir, 'COPYING.txt'));
	manifest.engines[e.id] = {
		precache: e.precache,
		onDemand: !e.precache,
		script: `${e.dir}/${e.script}`,
		wasm: `${e.dir}/${e.wasm}`,
		totalBytes: files.reduce((n, f) => n + f.bytes, 0),
		files,
	};
}

await writeFile(path.join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, '\t') + '\n');
console.log(`wrote ${path.relative(webRoot, path.join(outRoot, 'manifest.json'))}`);

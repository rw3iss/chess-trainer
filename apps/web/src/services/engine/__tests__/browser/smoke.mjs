#!/usr/bin/env node
// Real-browser smoke test for the engine layer (not part of vitest).
//   node src/services/engine/__tests__/browser/smoke.mjs [path/to/maia_rapid.onnx]
// Bundles entry.ts with Vite, serves it + public/engines over HTTP, runs it in
// headless Chromium (real Worker, real WASM, real onnxruntime-web).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../../../../..');
const coreSrc = path.resolve(webRoot, '../../packages/core/src');
const outDir = path.join(webRoot, 'node_modules/.cache/engine-smoke');
const model = process.argv[2] ?? '/tmp/maia/dl/maia_rapid.onnx';

await build({
	configFile: false,
	logLevel: 'warn',
	root: here,
	base: '/',
	resolve: {
		alias: [
			{ find: /^@chess\/core$/, replacement: path.join(coreSrc, 'index.ts') },
			{ find: /^@chess\/core\/(.+)$/, replacement: path.join(coreSrc, '$1/index.ts') },
		],
	},
	build: { outDir, emptyOutDir: true, target: 'es2022', rollupOptions: { input: path.join(here, 'index.html') } },
});

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = createServer((req, res) => {
	const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	let file;
	if (url.startsWith('/engines/')) file = path.join(webRoot, 'public', url);
	else if (url === '/models/maia_rapid.onnx') file = existsSync(model) ? model : '';
	else file = path.join(outDir, url === '/' ? 'index.html' : url);
	if (!file || !existsSync(file) || statSync(file).isDirectory()) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'content-length': statSync(file).size });
	if (req.method === 'HEAD') res.end();
	else createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
let failed = false;
try {
	const page = await browser.newPage();
	page.on('pageerror', (e) => console.error('pageerror', e));
	page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
	await page.goto(base);
	await page.waitForFunction(() => 'runSmoke' in window);
	const log = await page.evaluate(() => window.runSmoke());
	for (const l of log) console.log('  ' + l);
	console.log('BROWSER SMOKE: PASS');
} catch (e) {
	failed = true;
	console.error('BROWSER SMOKE: FAIL', e);
} finally {
	await browser.close();
	server.close();
}
process.exit(failed ? 1 : 0);

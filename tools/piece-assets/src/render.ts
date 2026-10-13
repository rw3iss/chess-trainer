import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const webPkg = path.resolve(HERE, '../../../apps/web/package.json');

/** Screenshot an HTML file with Playwright (resolved from apps/web devDeps). */
export async function renderPreview(htmlFile: string, pngFile: string, width = 1100): Promise<string> {
	const require = createRequire(webPkg);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const { chromium } = require('@playwright/test') as { chromium: any };
	fs.mkdirSync(path.dirname(pngFile), { recursive: true });
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
	await page.goto('file://' + htmlFile);
	await page.screenshot({ path: pngFile, fullPage: true });
	await browser.close();
	return pngFile;
}

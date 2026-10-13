// Shared module aliases for Vite, Vitest and (mirrored in) tsconfig.app.json paths.
// '@chess/core' points at the core package *source* so the web app gets HMR
// without a core build step (PLAN §1 / CLAUDE.md).
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('..', import.meta.url));
const coreSrc = path.resolve(root, '../../packages/core/src');

export const aliases = [
	{ find: /^@chess\/core$/, replacement: path.join(coreSrc, 'index.ts') },
	{ find: /^@chess\/core\/(.+)$/, replacement: path.join(coreSrc, '$1/index.ts') },
	{ find: /^@styles\//, replacement: path.resolve(root, 'styles') + '/' },
	{ find: /^@\//, replacement: path.resolve(root, 'src') + '/' },
];

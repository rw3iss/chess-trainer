// Service-worker precache exclusions (used by the VitePWA block in vite.config.ts).
// Only the DEFAULT piece set is precached; other sets are cached by the SW (CacheFirst)
// the first time they are used. The default id is read from @chess/core so the two never drift.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { root } from './aliases.ts';

const THEMES_SRC = path.resolve(root, '../../packages/core/src/theme/themes.ts');
const PIECES_DIR = path.resolve(root, 'public/pieces');
const FALLBACK_PIECE_SET = 'lux';

/** DEFAULT_PIECE_THEME_ID from packages/core/src/theme/themes.ts. */
export function defaultPieceSetId(): string {
	try {
		const m = /DEFAULT_PIECE_THEME_ID\s*=\s*'([^']+)'/.exec(readFileSync(THEMES_SRC, 'utf8'));
		return m?.[1] ?? FALLBACK_PIECE_SET;
	} catch {
		return FALLBACK_PIECE_SET;
	}
}

/** globIgnores: on-demand engines/models, source maps, non-default piece sets, notes chunks. */
export function pwaPrecacheIgnores(): string[] {
	const keep = defaultPieceSetId();
	const otherSets = existsSync(PIECES_DIR)
		? readdirSync(PIECES_DIR, { withFileTypes: true })
				.filter((d) => d.isDirectory() && d.name !== keep)
				.map((d) => `pieces/${d.name}/**`)
		: [];
	return [
		'engines/stockfish-full/**',
		'engines/maia/**',
		'**/ort-wasm*.wasm',
		'**/*.onnx',
		'**/*.map',
		'pieces/preview.html',
		'data/notes*',
		...otherSets,
	];
}

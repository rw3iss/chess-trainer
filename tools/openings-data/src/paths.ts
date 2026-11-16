import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = resolve(here, '..');
export const REPO_ROOT = resolve(TOOL_DIR, '../..');
export const CACHE_DIR = resolve(TOOL_DIR, '.cache');
export const SRC_CACHE = resolve(CACHE_DIR, 'src');
export const NOTES_CACHE = resolve(CACHE_DIR, 'notes');
export const POP_CACHE = resolve(CACHE_DIR, 'popularity');
export const WIKI_LINES_CACHE = resolve(CACHE_DIR, 'wikibooks');
export const OUT_DIR = resolve(REPO_ROOT, 'apps/web/public/data');
export const ENV_FILE = resolve(REPO_ROOT, '.env');
/** Generic client id with the repo URL as contact (Wikimedia UA policy). An extra contact can be set in DATA_CONTACT. */
export const USER_AGENT = `chess-trainer-data/0.2 (+https://github.com/rw3iss/chess-trainer${process.env.DATA_CONTACT ? '; ' + process.env.DATA_CONTACT : ''})`;
export const DATA_VERSION = 1;

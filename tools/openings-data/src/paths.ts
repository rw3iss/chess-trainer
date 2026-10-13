import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = resolve(here, '..');
export const REPO_ROOT = resolve(TOOL_DIR, '../..');
export const CACHE_DIR = resolve(TOOL_DIR, '.cache');
export const SRC_CACHE = resolve(CACHE_DIR, 'src');
export const NOTES_CACHE = resolve(CACHE_DIR, 'notes');
export const POP_CACHE = resolve(CACHE_DIR, 'popularity');
export const OUT_DIR = resolve(REPO_ROOT, 'apps/web/public/data');
export const ENV_FILE = resolve(REPO_ROOT, '.env');
export const USER_AGENT = 'chess-openings-pwa-data/0.1 (https://github.com/rw3iss; rw3iss@gmail.com)';
export const DATA_VERSION = 1;

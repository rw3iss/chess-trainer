import { describe, expect, it } from 'vitest';
import { isApiRequest, isEngineAsset, NAVIGATION_DENYLIST } from './routes';

const SELF = 'https://chess.example';
const u = (href: string): URL => new URL(href, SELF);
const denied = (p: string): boolean => NAVIGATION_DENYLIST.some((re) => re.test(p));

describe('sw routes', () => {
	it('matches API GETs on the configured server, any host', () => {
		expect(isApiRequest(u('http://localhost:3000/health'), 'GET', SELF)).toBe(true);
		expect(isApiRequest(u('http://localhost:3000/openings/C60?x=1'), 'GET', SELF)).toBe(true);
		expect(isApiRequest(u('https://api.chess.example/users/me'), 'GET', SELF)).toBe(true);
		expect(isApiRequest(u('/api/games/abc'), 'GET', SELF)).toBe(true);
	});

	it('never caches POST, /sync, socket.io or unrelated paths', () => {
		expect(isApiRequest(u('http://localhost:3000/games'), 'POST', SELF)).toBe(false);
		expect(isApiRequest(u('http://localhost:3000/sync/pull'), 'GET', SELF)).toBe(false);
		expect(isApiRequest(u('http://localhost:3000/socket.io/?EIO=4'), 'GET', SELF)).toBe(false);
		expect(isApiRequest(u('http://localhost:3000/gamesx'), 'GET', SELF)).toBe(false);
		expect(isApiRequest(u('/games'), 'GET', SELF)).toBe(false); // same-origin SPA route, not API
		expect(isApiRequest(u('https://fonts.googleapis.com/openings'), 'GET', SELF)).toBe(false);
	});

	it('matches engine + model assets', () => {
		expect(isEngineAsset(u('/engines/stockfish-full/stockfish-19-single.wasm'), SELF)).toBe(true);
		expect(isEngineAsset(u('/assets/ort-wasm-simd-threaded-abc.wasm'), SELF)).toBe(true);
		expect(isEngineAsset(u('https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/e23a50e/public/maia2/maia_rapid.onnx'), SELF)).toBe(true);
		expect(isEngineAsset(u('/assets/index-abc.js'), SELF)).toBe(false);
		expect(isEngineAsset(u('https://raw.githubusercontent.com/other/repo/file.onnx'), SELF)).toBe(false);
	});

	it('navigation denylist skips api, socket.io and files', () => {
		expect(denied('/api/games')).toBe(true);
		expect(denied('/socket.io/')).toBe(true);
		expect(denied('/data/openings.v1.json')).toBe(true);
		expect(denied('/openings/C60')).toBe(false);
		expect(denied('/games')).toBe(false);
	});
});

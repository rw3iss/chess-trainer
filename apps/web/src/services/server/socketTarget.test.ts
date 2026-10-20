import { describe, expect, it } from 'vitest';
import { socketTarget } from './socketTarget';
import { resolveDefaultServerUrl } from './ServerConnector';

describe('socketTarget', () => {
	it('keeps the default path when the server is at the origin root', () => {
		expect(socketTarget('http://localhost:3000/engine')).toEqual({ url: 'http://localhost:3000/engine', path: '/socket.io' });
	});
	it('moves a path prefix into the socket.io path', () => {
		expect(socketTarget('https://chess.ryanweiss.net/api/play')).toEqual({ url: 'https://chess.ryanweiss.net/play', path: '/api/socket.io' });
	});
});

describe('resolveDefaultServerUrl', () => {
	it('falls back to localhost when unset', () => {
		expect(resolveDefaultServerUrl(undefined, 'https://chess.rw3iss.com')).toBe('http://localhost:3000');
	});
	it('resolves a relative value against the page origin', () => {
		expect(resolveDefaultServerUrl('/api', 'https://chess.rw3iss.com')).toBe('https://chess.rw3iss.com/api');
	});
	it('keeps an absolute value', () => {
		expect(resolveDefaultServerUrl('https://x.test/api', 'https://chess.rw3iss.com')).toBe('https://x.test/api');
	});
});

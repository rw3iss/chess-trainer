import { describe, expect, it } from 'vitest';
import { socketTarget } from './socketTarget';

describe('socketTarget', () => {
	it('keeps the default path when the server is at the origin root', () => {
		expect(socketTarget('http://localhost:3000/engine')).toEqual({ url: 'http://localhost:3000/engine', path: '/socket.io' });
	});
	it('moves a path prefix into the socket.io path', () => {
		expect(socketTarget('https://chess.ryanweiss.net/api/play')).toEqual({ url: 'https://chess.ryanweiss.net/play', path: '/api/socket.io' });
	});
});

import { BUILTIN_BOARD_THEMES } from '@chess/core/theme';
import type { PieceSetAsset, PieceTheme } from '@chess/core/theme';
import type { BoardRendererProps } from '../types';

export const pieceSet: PieceSetAsset = {
	id: 'test',
	name: 'Test',
	author: 'me',
	license: 'CC0',
	sprite: 'pieces/test/sprite.svg',
	layout: 'shared',
	viewBox: '0 0 45 45',
	defaultColors: {
		white: { body: '#fff', line: '#000', accent: '#000' },
		black: { body: '#000', line: '#000', accent: '#fff' },
	},
};

export const pieceTheme: PieceTheme = {
	id: 'test',
	name: 'Test',
	assetId: 'test',
	builtIn: true,
	colors: pieceSet.defaultColors,
	shading: 1,
	shadow: 0.5,
};

export function baseProps(over: Partial<BoardRendererProps> = {}): BoardRendererProps {
	return {
		fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		orientation: 'white',
		dests: new Map([
			['e2', ['e3', 'e4']],
			['g1', ['f3', 'h3']],
		]),
		movable: 'white',
		arrows: [],
		marks: [],
		animationMs: 0,
		coordinates: 'inside',
		showLegalDots: true,
		showLastMove: true,
		showCheck: true,
		input: 'both',
		onMove: () => {},
		boardTheme: BUILTIN_BOARD_THEMES[0],
		pieceTheme,
		pieceSet,
		...over,
	};
}

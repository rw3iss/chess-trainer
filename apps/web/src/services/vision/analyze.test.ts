import { describe, expect, it } from 'vitest';
import { analyzeBoard, cellSquare, findHighlights, type CellColor, type PieceClass, type SquareRead } from './analyze';

/** Reads from a placement string (FEN ranks, top of the image first), all sure. */
function reads(rows: string, low: Record<number, number> = {}): SquareRead[] {
	const out: SquareRead[] = [];
	for (const rank of rows.split('/'))
		for (const ch of rank) {
			if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push({ cls: 'empty', p: 0.99 });
			else out.push({ cls: ch as PieceClass, p: 0.99 });
		}
	for (const [i, p] of Object.entries(low)) out[Number(i)]!.p = p;
	return out;
}

const START = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR';
/** The same position drawn with Black at the bottom (rotated 180°). */
const START_ROTATED = 'RNBKQBNR/PPP1PPPP/8/3P4/8/8/pppppppp/rnbkqbnr';

function backgrounds(highlight: number[] = []): CellColor[] {
	return Array.from({ length: 64 }, (_, i) => {
		if (highlight.includes(i)) return { r: 205, g: 210, b: 106 };
		return (Math.floor(i / 8) + (i % 8)) % 2 === 0 ? { r: 240, g: 217, b: 181 } : { r: 181, g: 136, b: 99 };
	});
}

describe('analyzeBoard', () => {
	it('reads a white-at-the-bottom board', () => {
		const r = analyzeBoard(reads(START));
		expect(r.placement).toBe(START);
		expect(r.orientation).toBe('white');
		expect(r.fen).toBe(`${START} w KQkq - 0 1`);
		expect(r.turnFrom).toBe('default');
		expect(r.uncertain).toEqual([]);
	});

	it('turns a black-at-the-bottom board so White is at the bottom', () => {
		const r = analyzeBoard(reads(START_ROTATED));
		expect(r.orientation).toBe('black');
		expect(r.placement).toBe(START);
		expect(r.orientationConfidence).toBeGreaterThan(0.5);
	});

	it('side to move from the last-move highlight (e2 → e4 → Black to move)', () => {
		// Image cells: e2 = row 6 col 4 = 52, e4 = row 4 col 4 = 36.
		const r = analyzeBoard(reads(START), backgrounds([52, 36]));
		expect(r.turn).toBe('black');
		expect(r.turnFrom).toBe('highlight');
		expect(r.lastMove).toEqual(['e2', 'e4']);
		expect(r.fen.split(' ')[1]).toBe('b');
	});

	it('flags low-confidence squares by their square name', () => {
		const r = analyzeBoard(reads(START, { 36: 0.6 }));
		expect(r.uncertain).toEqual(['e4']);
	});
});

describe('findHighlights', () => {
	it('needs exactly two odd cells', () => {
		expect(findHighlights(backgrounds())).toBeNull();
		expect(findHighlights(backgrounds([1, 2, 3]))).toBeNull();
		expect(findHighlights(backgrounds([10, 20]))).toEqual([10, 20]);
	});
});

describe('cellSquare', () => {
	it('maps image cells to squares for both orientations', () => {
		expect(cellSquare(0, 'white')).toBe('a8');
		expect(cellSquare(63, 'white')).toBe('h1');
		expect(cellSquare(0, 'black')).toBe('h1');
		expect(cellSquare(63, 'black')).toBe('a8');
	});
});
